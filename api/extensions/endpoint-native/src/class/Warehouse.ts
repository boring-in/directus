import Country from "./Country";
import Supplier from "./Supplier";

// Interfaces to define the structure of various objects
interface ApiContext {
    getSchema(): Promise<any>;
    services: {
        ItemsService: any;
    };
}

interface Shipment {
    child_warehouse: {
        id: string;
        name: string;
        work_days: number[];
        country: string;
    };
    order_time: string;
    weekday: number;
    delivery_days: number;
}

interface Sender {
    parent_warehouse: {
        id: string;
    };
    weekday: number;
    order_time: string;
    delivery_days: number;
}

interface ProductStatistic {
    product: string;
    quantity: number;
}

interface DeliveryDetails {
    id: string;
    warehouse_name: string;
    delivery_date: Date;
    delivery_arrival_date: Date;
    delivery_days: number;
    next_delivery_date?: Date;
    next_delivery_arrival_date?: Date;
    work_days?: number;
}

interface OrderDetails {
    supplier_id: string;
    supplier_name: string;
    date: Date;
    delivery_days: number;
    delivery_date: Date;
}

class Warehouse {
    constructor(id) {
        this._id = id;
    }
    // --async function, that loads all of the data for object from db. Must be used after creating an object , using *await*--
    async load(context) {
        this._context = context;
        let newSchema = await this._context.getSchema();
        const { ItemsService } = this._context.services;
        let warehouseService = new ItemsService("warehouse", { schema: newSchema });
        let warehouseData = await warehouseService.readOne(this._id, {
            fields: ["name", "country", "work_days", "shipments.*", "shipments.child_warehouse.work_days", "shipments.child_warehouse.country", "shipments.child_warehouse.id", "shipments.child_warehouse.name", "warehouse_permissions","senders.parent_warehouse.id","senders.weekday","senders.order_time","senders.delivery_days"],
        });
        // console.log(warehouseData);
        this._shipments = warehouseData.shipments;
        //console.log(this._shipments);
        this._name = warehouseData.name;
        this._countryId = warehouseData.country;
        this._workDays = warehouseData.work_days; //string array;
        this._warehouseUsersGroupUuid = warehouseData.warehouse_permissions;
        this._senders = warehouseData.senders;
    }
    get id() {
        return this._id;
    }
    get name() {
        return this._name;
    }
    get Country() {
        return this.getCountry();
    }
    get Suppliers() {
        return this.getSuppliers();
    }
    get workDays() {
        return this._workDays;
    }
    get warehouseUsersGroupUuid() {
        return this._warehouseUsersGroupUuid;
    }
    get childWarehouses() {
        return this.childWarehouses;
    }
    //-- returns warehouse country
    async getCountry() {
        if (!this._Country) {
            this._Country = new Country(this._countryId);
            await this._Country.load(this._context);
        }
        return this._Country;
    }
    //-- returns warehouse suppliers
    async getSuppliers() {
        if (!this._Suppliers) {
            let resultArray = new Array();
            let context = this._context;
            let newSchema = await this._context.getSchema();
            const { ItemsService } = this._context.services;
            let warehouseService = new ItemsService("warehouse", {
                schema: newSchema,
            });
            let warehouseData = await warehouseService.readOne(this._id, {
                fields: ["suppliers.*"],
            });
            let suppliersArray = await warehouseData.suppliers;
            let supplierArrayLength = suppliersArray.length;
            for (let i = 0; i < supplierArrayLength; i++) {
                let supplier = new Supplier(suppliersArray[i].supplier_supplier_id);
                await supplier.load(context);
                resultArray.push(supplier);
            }
            this._Suppliers = resultArray;
        }
        return this._Suppliers;
    }
    //-- returns calculated  nearest posible order dates from all suppliers
    async getSuppliersOrderDateList(date) {
        await this.getSuppliers();
        let resultArray = new Array();
        let supplierArrayLength = this._Suppliers.length;
        for (let i = 0; i < supplierArrayLength; i++) {
            let supplier = this._Suppliers[i];
            let supplyTime = await this.getSupplyTime(supplier, date);
            let deliveryArrivalDate = new Date(supplyTime.date);
            deliveryArrivalDate.setDate(deliveryArrivalDate.getDate() + supplyTime.delivery_days);
            let result = {
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                date: supplyTime.date,
                delivery_days: supplyTime.delivery_days,
                delivery_arrival: deliveryArrivalDate
            };
            resultArray.push(result);
        }
        return resultArray;
    }
    //-- calculates nearest valid order date for given supplier
    async getSupplyTime(supplier, date) {
        await this.getCountry();
        let supplierOrderDateInfo = await supplier.getNextOrderDate(date);
        let supplierCountry = await supplier.Country;
        let resultDate;
        let resultDeliveryDays = this.validDeliveryDays(supplierOrderDateInfo.date, supplierOrderDateInfo.delivery_days);
        var bufferDate = new Date(supplierOrderDateInfo.date);
        while (!resultDate) {
            if (this.isWorkDay(bufferDate) &&
                !this._Country.isPublicHoliday(bufferDate)) {
                resultDate = bufferDate;
            }
            else {
                if (date < bufferDate) {
                    let x = new Date(0);
                    x.setUTCMilliseconds(bufferDate.setDate(bufferDate.getDate() - 1));
                    bufferDate = x;
                    resultDeliveryDays = this.validDeliveryDays(bufferDate, Math.ceil((bufferDate.getTime() - date.getTime()) / 86400000) +
                        supplierOrderDateInfo.delivery_days);
                }
                else {
                    do {
                        let x = new Date(0);
                        x.setUTCMilliseconds(bufferDate.setDate(bufferDate.getDate() + 1));
                        bufferDate = x;
                    } while (supplier.isWorkDay(bufferDate) && // kol supplierio 
                        !supplierCountry.isPublicHoliday(bufferDate));
                }
            }
        }
        // console.log("\n\n\nGET ORDER TIMER DEBUG: RESULT DELIVERY DAYS ");
        // console.log(resultDeliveryDays)
        return { date: resultDate, delivery_days: resultDeliveryDays };
    }
    //-- returns calculated nearest valid order date for given supplier
    async getSuppliersOrderDate(date, supplierId) {
        await this.getSuppliers();
        let result;
        let supplier = this._Suppliers.find((o) => o.id == supplierId);
        // console.log("getSuppliersOrderDate supplier")
        // console.log(supplier)
        let supplyTime = await this.getSupplyTime(supplier, date);
        let deliveryDate = new Date(supplyTime.date);
        deliveryDate.setDate(deliveryDate.getDate() + supplyTime.delivery_days);
        result = {
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            date: supplyTime.date,
            delivery_days: supplyTime.delivery_days,
            delivery_date: deliveryDate
        };
        return result;
    }
    //-- returns valid order dates and delivery days for all child warehouses
    // TODO: get child warehouses delivery info
    async getChildsDeliveryInfo(date) {
        await this.getCountry();
        let childsDeliveryArray = new Array();
        let testDate = new Date(date);
        for (let i = 0; i < this._shipments.length; i++) {
            let childWarehouseWorkDays = this._shipments[i].child_warehouse.work_days;
            let childWarehouseCountryId = this._shipments[i].child_warehouse.country;
            let deliveryInfo = this.getChildsDeliveryDateInfo(testDate, this._shipments[i]);
            let deliveryDate = deliveryInfo.finalDate;
            let deliveryDays = deliveryInfo.deliveryDays;
            let deliveryArrivalDays = await this.childValidDeliveryDays(deliveryDate, deliveryDays, childWarehouseCountryId, childWarehouseWorkDays);
            // console.log("GET ORDER TIMER DEBUG: Shipment Date");
            // console.log("Shipment: "+deliveryDate);
            let nextBufferDate = new Date();
            nextBufferDate.setDate(deliveryDate.getDate());
            nextBufferDate.setMonth(deliveryDate.getMonth());
            nextBufferDate.setFullYear(deliveryDate.getFullYear());
            nextBufferDate.setHours(deliveryDate.getHours());
            nextBufferDate.setMinutes(deliveryDate.getMinutes());
            let nextDeliveryDate = await this.getChildDeliveryInfo(nextBufferDate, this._shipments[i].child_warehouse.id);
            //let nextValidDeliveryDays = await this.childValidDeliveryDays(nextDeliveryDate.delivery_date,nextDeliveryDate.delivery_days,this._shipments[i].child_warehouse.country,this._shipments[i].child_warehouse.work_days)
            let workDays = await this.workDaysCount(nextBufferDate, nextDeliveryDate.delivery_date);
            let childsDeliveryData = {
                id: this._shipments[i].child_warehouse.id,
                warehouse_name: this._shipments[i].child_warehouse.name,
                delivery_date: deliveryDate,
                delivery_arrival_date: deliveryInfo.arrivalDate,
                delivery_days: deliveryArrivalDays,
                next_delivery_date: nextDeliveryDate.delivery_date,
                next_delivery_arrival_date: nextDeliveryDate.delivery_arrival_date,
                work_days: workDays
            };
            childsDeliveryArray.push(childsDeliveryData);
        }
        return childsDeliveryArray;
    }
    //-- returns valid order date and delivery days for single child warehouse
    async getChildDeliveryInfo(date, childWarehouseId) {
        await this.getCountry();
        console.log("\n\ngetChildsDeliveryInfo input date");
        console.log(date);
        let childWarehouse = this._shipments.find((o) => o.child_warehouse.id == childWarehouseId);
        let childWarehouseWorkDays = childWarehouse.child_warehouse.work_days;
        let childWarehouseCountryId = childWarehouse.child_warehouse.country;
        let deliveryInfo = this.getChildsDeliveryDateInfo(date, childWarehouse);
        let deliveryDate = deliveryInfo.finalDate;
        console.log("getChildsDelivery finalDate:");
        console.log(deliveryDate);
        let deliveryDays = deliveryInfo.deliveryDays;
        let deliveryArrivalDays = await this.childValidDeliveryDays(deliveryDate, deliveryDays, childWarehouseCountryId, childWarehouseWorkDays);
        let childsDeliveryData = {
            id: childWarehouse.child_warehouse.id,
            warehouse_name: childWarehouse.child_warehouse.name,
            delivery_date: deliveryDate,
            delivery_arrival_date: deliveryInfo.arrivalDate,
            delivery_days: deliveryArrivalDays,
        };
        return childsDeliveryData;
    }
    //-- calculates nearest valid order date and delivery days for given warehouse , need to add shipment arrival date
    getChildsDeliveryDateInfo(date, warehouseSupplyData) {
        let bufferDate = new Date(date);
        let minDateInfo = this.getMinDate(warehouseSupplyData, date);
        let createShipmentBy = new Date(0);
        createShipmentBy.setUTCMilliseconds(minDateInfo.minDate);
        let shipmentDate;
        let arrivalDate;
        // @ts-ignore
        while (!shipmentDate) {
            // @ts-ignore
            if (!this._Country.isPublicHoliday(createShipmentBy) &&
                this.isWorkDay(createShipmentBy)) {
                shipmentDate = createShipmentBy;
            }
            else {
                createShipmentBy.setDate(createShipmentBy.getDate() - 1);
                if (createShipmentBy.getTime() <= date.getTime()) {
                    bufferDate.setDate(bufferDate.getDate() + 1);
                    minDateInfo = this.getMinDate(warehouseSupplyData, bufferDate);
                    let buffDate2 = new Date(0);
                    buffDate2.setUTCMilliseconds(minDateInfo.minDate);
                    createShipmentBy = buffDate2;
                }
            }
        }
        arrivalDate = new Date(shipmentDate);
        arrivalDate.setDate(arrivalDate.getDate() + minDateInfo.deliveryDays + 1);
        console.log("SHIPMENT ARRIVAL DATE :");
        console.log(arrivalDate);
        return { finalDate: shipmentDate, deliveryDays: minDateInfo.deliveryDays, arrivalDate: arrivalDate };
    }

    getSenderDeliveryDateInfo(currentDate, senderId) {
        // Ensure currentDate is a Date object
        const currentMoment = currentDate instanceof Date 
          ? currentDate 
          : new Date(currentDate);
    
        // Filter sender data for the specific sender ID
        const relevantSenders = this._senders.filter(
          sender => sender.parent_warehouse.id === senderId
        );
    
        if (relevantSenders.length === 0) {
          throw new Error(`No sender found with ID ${senderId}`);
        }
    
        // Get current day of week (0 = Sunday, 1 = Monday, etc.)
        const currentWeekday = currentMoment.getDay();
    
        // Find the next possible order date
        let nearestOrderDetails = null;
        let minDaysDifference = Infinity;
    
        relevantSenders.forEach(sender => {
          // Calculate days difference considering weekday and delivery days
          let daysDifference = sender.weekday - currentWeekday;
          
          // Adjust for crossing week boundary
          if (daysDifference < 0) {
            daysDifference += 7;
          }
    
          // Parse order time
          const [hours, minutes, seconds] = sender.order_time.split(':').map(Number);
    
          // Create a new date for potential order date
          const potentialOrderDate = new Date(currentMoment);
          potentialOrderDate.setDate(currentMoment.getDate() + daysDifference);
          
          // Set time to order time
          potentialOrderDate.setHours(hours, minutes, seconds, 0);
    
          // If current time is past order time, move to next week
          if (daysDifference === 0 && currentMoment > potentialOrderDate) {
            potentialOrderDate.setDate(potentialOrderDate.getDate() + 7);
          }
    
          // Calculate time difference
          const timeDiff = potentialOrderDate.getTime() - currentMoment.getTime();
          const dayDiff = timeDiff / (1000 * 3600 * 24);
    
          // Update nearest order date if this is closer
          if (dayDiff < minDaysDifference) {
            // Calculate delivery date by adding delivery days to order date
            const deliveryDate = new Date(potentialOrderDate);
            deliveryDate.setDate(potentialOrderDate.getDate() + sender.delivery_days);
    
            nearestOrderDetails = {
              orderDate: potentialOrderDate,
              deliveryDate: deliveryDate,
              deliveryDays: sender.delivery_days,
              senderId: sender.parent_warehouse.id
            };
            minDaysDifference = dayDiff;
          }
        });
    
        return nearestOrderDetails;
      }
    //-- calculates nearest posible order date for child warehouse
    getMinDate(childWarehouseSupplyData, date) {
        // a here stands for different number , either 7 or 30 , depending on freq type ( monthly - weekly );
        let a = 7;
        let minDate = 0;
        let bufferDate = new Date(date);
        let found = false;
        let deliveryDays = 0;
        while (!found) {
            let dayDifference;
            let orderTime = childWarehouseSupplyData.order_time.split(":");
            let itemOrderDay = childWarehouseSupplyData.weekday;
            let currentDay = bufferDate.getUTCDay();
            if (currentDay == 0) {
                currentDay = 7;
            }
            if (itemOrderDay >= currentDay) {
                dayDifference = itemOrderDay - currentDay;
            }
            else {
                dayDifference = a - currentDay + itemOrderDay;
            }
            let orderDate = new Date(bufferDate);
            orderDate.setDate(bufferDate.getDate() + dayDifference);
            orderDate.setHours(orderTime[0], orderTime[1], orderTime[2]);
            if (bufferDate.getTime() > orderDate.getTime()) ;
            if (minDate == 0 ||
                (minDate > orderDate.getTime() &&
                    bufferDate.getTime() < orderDate.getTime())) {
                minDate = orderDate.getTime();
                deliveryDays = childWarehouseSupplyData.delivery_days;
            }
            if (minDate < bufferDate.getTime()) {
                bufferDate.setDate(bufferDate.getDate() + 1);
                minDate = 0;
            }
            else {
                found = true;
            }
        }
        return { minDate: minDate, deliveryDays: deliveryDays };
    }
    //-- checks if given day is work day
    //CHATPGT VER:
    isWorkDay(date) {
        let weekDay = date.getUTCDay();
        for (let workDay of this._workDays) {
            if (workDay == weekDay) {
                return true;
            }
        }
        return false;
    }
    // public isWorkDay(date: Date) {
    //   let ans = false;
    //   let weekDay = date.getUTCDay();
    //   this._workDays.find(function (workDay: any) {
    //     if (parseInt(workDay) == weekDay) {
    //       ans = true;
    //     }
    //   });
    //   return ans;
    // }
    // calculates work day count between two given dates
    async workDaysCount(startDateProto, endDateProto) {
        console.log("workdaysCount");
        let startDate = new Date(startDateProto);
        let endDate = new Date(endDateProto);
        await this.getCountry();
        let count = 1;
        while (startDate < endDate) {
            if (this.isWorkDay(startDate) &&
                !this._Country.isPublicHoliday(startDate)) {
                count++;
            }
            startDate.setDate(startDate.getDate() + 1);
        }
        return count;
    }
    //-- checks if given day is child warehouse work day
    isChildWorkDay(date, childsWorkDays) {
        let ans = false;
        let weekDay = date.getUTCDay();
        // console.log("CHILDS WORK DAYS:")
        // console.log(childsWorkDays);
        childsWorkDays.find(function (workDay) {
            if (parseInt(workDay) == weekDay) {
                ans = true;
            }
        });
        return ans;
    }
    //-- calculates valid delivery days for this warehouse
    validDeliveryDays(date, deliverydays) {
        // console.log("warehouse validDeliveryDays");
        var deliveryDate = new Date(date);
        deliveryDate.setDate(deliveryDate.getDate() + deliverydays);
        while (!this.isWorkDay(deliveryDate) || this._Country.isPublicHoliday(deliveryDate)) {
            deliverydays++;
            deliveryDate.setDate(deliveryDate.getDate() + 1);
        }
        return deliverydays;
    }
    // private validDeliveryDays(date: Date, deliverydays: number) {
    //   var deliveryDate: Date = new Date(date);
    //   deliveryDate.setDate(deliveryDate.getDate() + deliverydays);
    //   var found: boolean = false;
    //   while (!found) {
    //     if (
    //       !this.isWorkDay(deliveryDate) ||
    //       this._Country.isPublicHoliday(deliveryDate)
    //     ) {
    //       deliverydays++;
    //       deliveryDate.setDate(deliveryDate.getDate() + 1);
    //     } else {
    //       found = true;
    //     }
    //   }
    //   return deliverydays;
    // }
    //-- calculates valid delivery days for child warehouse
    async childValidDeliveryDays(date, deliverydays, countryId, childsWorkDays) {
        console.log("childValidDeliveryDays");
        var deliveryDate = new Date(date);
        deliveryDate.setDate(deliveryDate.getDate() + deliverydays);
        var found = false;
        while (!found) {
            if (!this.isChildWorkDay(deliveryDate, childsWorkDays) ||
                (await Country.isPublicHoliday(countryId, deliveryDate, this._context))) {
                deliverydays++;
                deliveryDate.setDate(deliveryDate.getDate() + 1);
            }
            else {
                found = true;
            }
        }
        return deliverydays;
    }
    statistic(warehouseSalesData) {
        let salesStatisticArray = [];
        // console.log(this._warehouseSalesData)
        for (let x = 0; x < warehouseSalesData.length; x++) {
            let data = warehouseSalesData[x];
            if (x == 0) {
                let newJson = { product: data.product, quantity: data.quantity };
                salesStatisticArray.push(newJson);
            }
            else {
                let dataIndex = salesStatisticArray.findIndex(x => x.product == data.product);
                if (dataIndex >= 0) {
                    let currentJson = salesStatisticArray[dataIndex];
                    currentJson.quantity += data.quantity;
                    salesStatisticArray[dataIndex] = currentJson;
                }
                else {
                    let newJson = { product: data.product, quantity: data.quantity };
                    salesStatisticArray.push(newJson);
                }
            }
        }
        return salesStatisticArray;
    }
    async getWarehouseProducts() {
        let { ItemsService } = this._context.services;
        let schema = await this._context.getSchema();
        let warehouseService = new ItemsService("stock", { schema });
        let products = await warehouseService.readByQuery({ limit: -1 }, { filter: { warehouse: { _eq: this._id } } }, { fields: ["product"] });
        return products.length;
    }
    ;
    async getSoldWarehouseProducts(starDate, endDate) {
        let allProducts = await this.getWarehouseProducts();
        for (let i = 0; i < allProducts.length; i++) {
            //search for all sold products
        }
    }
} export default Warehouse;