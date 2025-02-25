import Log from "./Log";
import SalesDataCalculator from "../backupFolder/SalesDataCalculatorOld";
import Constants from "../const/Constants";
import Supplier from "./Supplier";
import Warehouse from "./Warehouse";

class WarehouseProductsData {
    parentProductsArray: Map<Number, any>;
    attributeConfigGroupArray: Map<Number, any>;
    individualProductArray: Map<Number, any>;
    purchaseData: Map<Number, any>;
   
    constructor() {
      this.parentProductsArray = new Map(); // misnomers , probably change to parentProductGroupMap
      this.attributeConfigGroupArray = new Map(); // misnomers , probably change to attributeConfigGroupMap
      this.individualProductArray = new Map(); // misnomers , probably change to individualProductMap
      this.purchaseData = new Map(); // misnomers , probably change to purchaseDataMap
    }
  }

class ProductsForecast {
   
    warehouseHierarchy: Map<Number ,Number>;
    arrivingProducts: Map<number,Map<number,number>>;
    parentWarehouseId: Number;
    parentWarehouseMap: Map<Number, WarehouseProductsData>;
    childWarehouseMap: Map<Number, WarehouseProductsData>;
    deliveryTerm: Number;
    supplier: Supplier;
    private timeCache : number[];
    private currentDate : Date;
    private orderedSales : Map<Number,Number>;
    private context : any;
    

    constructor(warehouseHierarchy,arrivingproducts,context,supplier = null){
        this.warehouseHierarchy = warehouseHierarchy; 
        this.arrivingProducts = arrivingproducts;
        this.parentWarehouseId = Array.from(this.warehouseHierarchy.keys())[0];
        this.parentWarehouseMap = new Map();
        this.childWarehouseMap = new Map();
        this.parentWarehouseMap.set(this.parentWarehouseId, new WarehouseProductsData())
        this.createChildWarehouseMap(this.warehouseHierarchy.get(this.parentWarehouseId));
        this.deliveryTerm = 0; //orderDeliveryTerm; 
        this.supplier = supplier;
        this.currentDate = new Date();
        this.timeCache = [];
        this.orderedSales = new Map();
        this.context = context;
        
    }

    async loadData(initialData:Array<any>){
        
        for (let a = 0, len = initialData.length; a < len; a++) {
         await this.productSorting(initialData[a]);
        }

    }

    async execute (){
     
      this.childWarehouseMap.forEach((warehouseProductsData,key) => { // this.childWarehopuseMap
        //@ts-ignore
        
          warehouseProductsData.purchaseData =  this.prepareForSendToCalc(warehouseProductsData,null);
          this.childWarehouseMap.set(key,warehouseProductsData);
      });

    
      //@ts-ignore
      this.parentWarehouseMap.get(this.parentWarehouseId).purchaseData = 
       this.prepareForSendToCalc(this.parentWarehouseMap.get(this.parentWarehouseId),this.childWarehouseMap);
  

      return this.parentWarehouseMap;
    

    }

    private createChildWarehouseMap (item){
      if (!item || !(item instanceof Map)) {
        return;
      }
      item.forEach((value,key) => {
        this.childWarehouseMap.set(key, new WarehouseProductsData());
        this.createChildWarehouseMap(value);
      });
      
    }

    // private createChildWarehouseMap ( item : Map<Number,any>){
    //   for (let [key , value] of item) {

    //     this.childWarehouseMap.set(key, new WarehouseProductsData());
    //     this.createChildWarehouseMap(value);
    //   }
    // }

  //   private createChildWarehouseMap(warehouseHierarchy: Map<number, any>) {
  //     if (!warehouseHierarchy || !(warehouseHierarchy instanceof Map)) {
  //         return;
  //     }
      
  //     for (const [warehouseId, childWarehouses] of warehouseHierarchy) {
  
          
  //         // Create entry for current warehouse
  //         this.childWarehouseMap.set(warehouseId, new WarehouseProductsData());
  
  //         // If childWarehouses is a Map, process it recursively
  //         if (childWarehouses instanceof Map && childWarehouses.size > 0) {
 
  //             this.createChildWarehouseMap(childWarehouses);
  //         }
  //     }
  // }


    private async individualProductPush(product, moq) {
       // product.package_MOQ = moq;
        let deliveryTerm = this.deliveryTerm;
        if (product.delivery_term != null) {
          deliveryTerm += product.delivery_term; // jeigu pats produktas turi delivery term
        } else if (product.attribute_config_delivery_time != null) {
          deliveryTerm += product.attribute_config_delivery_time; // jeigu turi attribute config delivery term
        } else if (product.supplier_parent_delivery_time != null) {
          deliveryTerm += product.supplier_parent_delivery_time; // jeigu turi supplier product parent delivery term
        }
        product.delivery_term = deliveryTerm;
          if(this.supplier != null){
            let deliveryDates = await this.dateCalc(deliveryTerm, this.currentDate); //-- iskelti atgal i purchaseSizeCalc
            product.first_order_arrival_days = deliveryDates[0]; // 
            product.second_order_arrival_days = deliveryDates[1]; // ---------------------------------------
          }
          else{
            let warehouse = new Warehouse(product.warehouse);
            await warehouse.load(this.context);
            let firstrOrderArrivalInfo = await warehouse.getSenderDeliveryDateInfo(this.currentDate,product.warehouse_src);
            let secondOrderArrivalInfo = await warehouse.getSenderDeliveryDateInfo(firstrOrderArrivalInfo.deliveryDate,product.warehouse_src);
            product.first_order_arrival_days = firstrOrderArrivalInfo.deliveryDays;
            product.second_order_arrival_days = secondOrderArrivalInfo.deliveryDays;
            product = this.arrivingQuantityInit(product);
          }
        if(product.warehouse == this.parentWarehouseId){
          //@ts-ignore
          this.parentWarehouseMap
          .get(product.warehouse)
          .individualProductArray.set(product.product_id, product);
          }
        else{
          //@ts-ignore
         
            this.childWarehouseMap.get(product.warehouse).individualProductArray.set(product.product_id, product);
          
        }
    }

    private async attributeProductPush(product){
      let attributeConfigID : Number ;
      if (product.attribute_config_group.split(",").length > 1) {
        let attributeConfigData = JSON.parse(product.attribute_config_data);
        attributeConfigID = attributeConfigData[0].attribute_config_id;
        product.attribute_config_moq = attributeConfigData[0].moq;
        product.attribute_config_delivery_time = attributeConfigData[0].delivery_time ;

      } else {
        attributeConfigID = product.attribute_config_group;
      }
      if (
        //@ts-ignore
        !this.parentWarehouseMap
          .get(product.warehouse)
          .attributeConfigGroupArray.has(attributeConfigID)
      ) {
        let deliveryTerm =this.deliveryTerm;
        if (product.attribute_config_delivery_time != null) {
          deliveryTerm += product.attribute_config_delivery_time;
        } else if (product.supplier_parent_delivery_time != null) {
          deliveryTerm += product.supplier_parent_delivery_time;
        }
       
        let deliveryDates = await this.dateCalc(deliveryTerm, this.currentDate);
        let innerProductMap = new Map();
        product.first_order_arrival_days = deliveryDates[0];
        product.second_order_arrival_days= deliveryDates[1];
        product = this.arrivingQuantityInit(product);
        innerProductMap.set(product.product_id, product);
        
        //@ts-ignore
        this.parentWarehouseMap
          .get(product.warehouse)
          .attributeConfigGroupArray.set(attributeConfigID, {
            moq: product.attribute_config_moq,
            delivery_term: deliveryTerm,
            first_order_arrival_days: deliveryDates[0],
            second_order_arrival_days: deliveryDates[1],
            products: innerProductMap,
          });
      } else {
        //@ts-ignore
        this.parentWarehouseMap
          .get(product.warehouse)
          .attributeConfigGroupArray.get(attributeConfigID)
          .products.set(product.product_id, product);
      }
    }

    private async parentProductPush(product){
     
     
      if (
        //@ts-ignore
        !this.parentWarehouseMap
          .get(product.warehouse)
          .parentProductsArray.has(product.parent_product)
      ) {
        let deliveryTerm =this.deliveryTerm;//30
        if (product.supplier_parent_delivery_time != null) {
          deliveryTerm += product.supplier_parent_delivery_time; //++ suplier parent delivery time 60 =90
        }
        let deliveryDates = await this.dateCalc(deliveryTerm, this.currentDate);

        let innerProductMap = new Map();
        product.first_order_arrival_days = deliveryDates[0];
        product.second_order_arrival_days= deliveryDates[1];
        product = this.arrivingQuantityInit(product);
        innerProductMap.set(product.product_id, product);

        //@ts-ignore
        this.parentWarehouseMap
          .get(product.warehouse)
          .parentProductsArray.set(product.parent_product, {
            moq: product.supplier_parent_moq, //> product.parent_wh_moq ? product.supplier_parent_moq: product.parent_wh_moq,
            delivery_term: deliveryTerm,
            first_order_arrival_days: deliveryDates[0],
            second_order_arrival_days: deliveryDates[1],
            products: innerProductMap,
            individualProductsCount: 0,
          });
      } else {
        //@ts-ignore
        this.parentWarehouseMap
          .get(product.warehouse)
          .parentProductsArray.get(product.parent_product)
          .products.set(product.product_id, product);
      }
    }
      
      private async productSorting(product) {
        if (product.attribute_config_data != null) {
          let jsonedString = JSON.parse(product.attribute_config_data);
          product.attribute_config_moq = jsonedString[0].moq;
          product.attribute_config_delivery_time = jsonedString[0].delivery_time;
        }
        // let arrivingProduct = this.arrivingProducts.get(
        //   product.warehouse + "_" + product.product_id
        // );
        // product.arriving_quantity = 0;
        // if (arrivingProduct != null && arrivingProduct != undefined) {
        //   product.arriving_quantity = arrivingProduct.arriving_quantity;
        // }
        // if(product.warehouse == this.parentWarehouseId){
        //     if (!this.parentWarehouseMap.has(product.warehouse)) {
        //         this.parentWarehouseMap.set(product.warehouse, new WarehouseProductsData());
        //     }
        // }
        // else{
        //     if (!this.childWarehouseMap.has(product.warehouse)) {
        //         this.childWarehouseMap.set(product.warehouse, new WarehouseProductsData());
        //     }
        // }   
        // ------------- Individual product filter ------------
        // This filter selects products based on their hierarchy and specific attributes ("Individual products")
        if (
          // Case 1: Select parent products that have no child products
          (product.is_parent === 1 && product.childs == null) ||
          // Case 2: Select child products (products with a parent) that have either:
          (product.parent_product != null &&
            // a) a specified Minimum Order Quantity (MOQ)
            product.moq != null)
            // Case 3 : Product is in child warehouse :
            || (product.warehouse != this.parentWarehouseId ) 
           // case 4 : supplier is null, we calculate only transfer
            || this.supplier ==null
        ) {
           await this.individualProductPush(product, product.moq);
        }
  
        // ------------- Attribute config group filter ------------

        // This condition checks for specific attribute configuration of child products
        else if (
          // Condition 1: The product has an attribute configuration
          product.attribute_config_id != null &&
          // Condition 2: The product is a child product (has a parent)
          product.parent_product != null
        ) {
         await  this.attributeProductPush(product);

        }
        // ------------------- moq to construct group filter (aka parent product group)----------------
  
        else if (
          product.parent_product != null &&
          product.supplier_parent_moq != null //|| product.supplier_parent_delivery_time != null)
        ) {

         await this.parentProductPush(product);

        } else if (product.childs == null) {
           await this.individualProductPush(product, null);
        }
        //   Log.toFile("", "AfterSortin", warehouseMap);
      }

      private prepareForSendToCalc(warehouseProductsData,childData){ 

        let individualProductArray = warehouseProductsData.individualProductArray;
        let attributeConfigGroupArray =
          warehouseProductsData.attributeConfigGroupArray;
        let parentProductsArray = warehouseProductsData.parentProductsArray;
        Log.toFile("", "individualProductArray", individualProductArray);
        Log.toFile("", "attributeConfigGroupArray", attributeConfigGroupArray);
        Log.toFile("", "parentProductsArray", parentProductsArray);
        let purchaseData = new Map();

        // calculates individual products purchase size
        
        let individualCalculatedDataArray = this.sendToCalc(
          Array.from(individualProductArray.values()),
          false,
          childData
        );
        Log.toFile("", "individualCalculation", individualCalculatedDataArray);
        // from calculated purchase size, moq is decreased to parent products and attribute config groups
        individualCalculatedDataArray.forEach((item) => {
          if (
            item.parent_product != null &&
            parentProductsArray.has(item.parent_product)
          ) {
            // decrease moq for parent product
            parentProductsArray.get(item.parent_product).moq -=
              item.needed_variant_quantity;
          }
          if (
            item.attribute_config_group != null &&
            attributeConfigGroupArray.has(item.attribute_config_group)
          ) {
            // decrease moq for attribute config group (this happens  if product applies to attribute config group , but has individual moq / delivery_term  settings )
            attributeConfigGroupArray.get(item.attribute_config_group).moq -=
              item.needed_variant_quantity;
            parentProductsArray.get(item.parent_product).moq -=
              item.needed_variant_quantity;
          }
          purchaseData.set(item.product_id, item);
        });
  
        
        // calculate purchase size for attribute config groups ( group has single moq, applied to all products )
        attributeConfigGroupArray.forEach((attributeConfigGroup,groupId) => {
      
          let attributeConfigGroupCalculatedDataArray = this.sendToCalc(
            attributeConfigGroup,
            true,
            childData
          );
          Log.toFile(
            "",
            "attributeConfigGroupCalculation",
            attributeConfigGroupArray
          );
          if (
            parentProductsArray.has(
              attributeConfigGroup.products.values().next().value.parent_product
            )
          )
            parentProductsArray.get(
              attributeConfigGroup.products.values().next().value.parent_product
            ).moq -= attributeConfigGroupCalculatedDataArray.finalOrderQuantity;
            purchaseData = this.mapJoin(purchaseData,attributeConfigGroup.products);
        });
        // calculate purchase size for products grouped by parent product
        parentProductsArray.forEach((parentProductsGroup,groupId) => {
      
          let parentProductCalculatedData = this.sendToCalc(parentProductsGroup, true, childData);
          // purchaseData = new Map([
          //   ...purchaseData.entries(),...parentProductCalculatedData.products.entries()]);
          // Log.toFile("", "parentProductCalculation", parentProductsArray);
        
              purchaseData = this.mapJoin(purchaseData,parentProductCalculatedData.products);
          
        });
        // as the parent porduct groups are last in calculation hierarchy, no further moq decrease is needed
       // warehouseProductsData.purchaseData = purchaseData;
      
        return purchaseData;
      }

      private sendToCalc(productData, groupCalculation,childData) {
        Log.toFile("", "productData", productData);
        let salesDataCalculator;
  
        if (groupCalculation) {
          salesDataCalculator = new SalesDataCalculator(
            Array.from(productData.products.values()),
            true,
            productData.moq,
            productData.first_order_arrival_days,
            productData.second_order_arrival_days,
            Constants.defaultCalculationMoq,
            Constants.defaultCalculationOrderCount,
            Constants.defaultCalculationBuffer,
            Constants.defaultCalculationTimespan,
            this.orderedSales
          
          );
        } else {
          salesDataCalculator = new SalesDataCalculator(
            productData,
            false,
            null,
            null,
            null,
            Constants.defaultCalculationMoq,
            Constants.defaultCalculationOrderCount,
            Constants.defaultCalculationBuffer,
            Constants.defaultCalculationTimespan,
            this.orderedSales
           
          );
        }
        let purchaseData = salesDataCalculator.calculateAllData(childData);
        if (groupCalculation) {
          productData.products = purchaseData.productCalculations;
          productData.finalOrderQuantity = purchaseData.orderQuantity;
          this.orderedSales = purchaseData.orderedSales;
        } else {
          productData = purchaseData.productCalculations;
          this.orderedSales = purchaseData.orderedSales;
        }
        Log.toCsv("sendToCalc",productData,true);
        return productData;
      }

      private mapJoin(parentMap, childMap) {
          childMap.forEach((value,key) => {
            parentMap.set(key,value);
        });
          return parentMap;
      }

      private async  dateCalc(dayCount : Number, currentDate : Date) { //TODO ateityje atskirti nuo kitu klasiu 
        let ans : number[] = [];
        let date = new Date(currentDate);
        if (this.timeCache[dayCount] == null) {
          let r1 = date.setDate(date.getDate() + dayCount);
          let m0 = await this.supplier.getNextOrderDate(new Date(r1));
  
          let deliveryDate = new Date();
          //  deliveryDate.setDate(deliveryDate.getDate() + m1);
  
          deliveryDate = addDays(m0.date.toString(), m0.delivery_days);
          let timeDifference = deliveryDate.getTime() - currentDate.getTime();
          let m1 = Math.ceil(timeDifference / (1000 * 3600 * 24));
          ans[0] = m1;
          let r2 = new Date(deliveryDate);
          r2.setDate(r2.getDate() + dayCount);
          let m01 = await this.supplier.getNextOrderDate(new Date(r2));
          let secondDeliveryDate = new Date();
          secondDeliveryDate = addDays(m01.date.toString(), m01.delivery_days);
          let timeDifference2 =
            secondDeliveryDate.getTime() - deliveryDate.getTime();
          // let deliveryDate1 = new Date();
          // deliveryDate1.setDate(deliveryDate1.getDate() + m11);
          let m11 = Math.ceil(timeDifference2 / (1000 * 3600 * 24));
          ans[1] = m11;
          this.timeCache[dayCount] = ans;
        } else {
          ans = this.timeCache[dayCount];
        }
  
        function addDays(date, days) {
          const newDate = new Date(date);
          newDate.setDate(newDate.getDate() + days);
          return newDate;
        }
        return ans;
      }

      private arrivingQuantityInit(product:any){
        console.log("arrivingQuantityInit")
        let productId = product.product_id;
        if(this.arrivingProducts.has(productId)){
          let firstOrderArrivalDays = product.first_order_arrival_days;
          let bothOrdersArrivalDays = product.first_order_arrival_days + product.second_order_arrival_days;
          let arrivingProduct = this.arrivingProducts.get(productId);
          arrivingProduct?.forEach((value,key) => {
            if(key <= firstOrderArrivalDays){
              product.remaining_stock_after_first_arrival += value;
            }
            else if(key > firstOrderArrivalDays && key <= bothOrdersArrivalDays){
              product.remaining_stock_after_second_arrival += value;
            }
          });
        }
        console.log(product.remaining_stock_after_first_arrival)
        console.log(product.remaining_stock_after_second_arrival)
        return product;
      }



      

    };
export default ProductsForecast;