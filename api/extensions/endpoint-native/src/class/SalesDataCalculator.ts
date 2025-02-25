import Log from './Log';

/**
 * Interface for product data used in sales calculations
 */
interface ProductData {
    product_id: number;
    available_quantity: number;
    arriving_quantity: number;
    product_calculation_type: number;
    parent_type: number;
    analysed_period: number;
    min_order_count: number;
    buffer: number;
    wh_moq: number;
    parent_analysed_period: number;
    parent_order_count: number;
    parent_buffer: number;
    parent_wh_moq: number;
    available: number;
    reserved_quantity: number;
    sales: number;
    ordered_sales: number;
    days_in_stock: number;
    kmeans_centroid: number;
    divisible: number;
    backorder: number;
    sales_per_day?: number;
    sales_percentage?: number;
    remaining_stock_days?: number;
    sales_until_first_arrival?: number;
    first_order_arrival_days?: number;
    remaining_stock_after_first_arrival?: number;
    sales_until_second_arrival?: number;
    second_order_arrival_days?: number;
    remaining_stock_after_second_arrival?: number;
    stock_needed_between_orders?: number;
    stock_surplus_until_second_order_arrival?: number;
    product_sellout_proportion?: number;
    needed_variant_quantity?: number;
    product_sellout_quantity?: number;
    total_variant_order_quantity?: number;
    total_variant_order_quantity_initial?: number;
    total_variant_copy?: number;
    buffer_after_calc?: number;
}

/**
 * Interface for purchase data
 */
interface PurchaseData {
    total_variant_order_quantity: number;
}

/**
 * Interface for child data
 */
interface ChildDataItem {
    purchaseData: Map<number, PurchaseData>;
}

/**
 * Class for calculating sales data for products
 */
class SalesDataCalculator {
    private readData: boolean;
    private isGroup: boolean;
    private _data: ProductData[];
    private orderArrivalDays: number | null;
    private secondArrivalDays: number | null;
    private allSales: number;
    private tempMoq: number;
    private salesPerDayAverage: number;
    private orderedStockSufficiency: number;
    private orderQuantity: number;
    private finalOrderQuantity: number;
    private moq: number;
    private envMoq: number;
    private envTimespan: number;
    private envOrderCount: number;
    private envBuffer: number;
    private _formatedData: Map<number, ProductData>;
    private childData: Map<number, ChildDataItem> | null;
    private orderedSales: Map<number, number>;
    private isParent: boolean;
    private bufferRequired: boolean;
    private childMoq: Map<number, number>;

    /**
     * Constructor for SalesDataCalculator
     * @param data - Product data array
     * @param isGroup - Boolean indicating if this is a group calculation
     * @param groupQuantity - Global MOQ value for a group
     * @param orderArrivalDays - Days until first order arrives
     * @param secondArrivalDays - Days until second order arrives
     * @param envMoq - Global MOQ value set in environment
     * @param envTimespan - Global timespan value set in environment
     * @param envOrderCount - Global order count value set in environment
     * @param envBuffer - Global buffer value set in environment
     * @param orderedSales - Map of ordered sales by product ID
     */
    constructor(
        data: ProductData[],
        isGroup: boolean,
        groupQuantity: number = 0,
        orderArrivalDays: number | null = null,
        secondArrivalDays: number | null = null,
        envMoq: number | null = null,
        envTimespan: number | null = null,
        envOrderCount: number | null = null,
        envBuffer: number | null = null,
        orderedSales: Map<number, number>
    ) {
        this.readData = false;
        this.isGroup = isGroup;
        this._data = data;
        this.orderArrivalDays = orderArrivalDays;
        this.secondArrivalDays = secondArrivalDays;
        if (this.orderArrivalDays == null) {
            this.readData = true;
        }
        this.allSales = 0;
        this.tempMoq = groupQuantity;
        this.salesPerDayAverage = 0;
        this.orderedStockSufficiency = 1;
        this.orderQuantity = 0;
        this.finalOrderQuantity = 0;
        this.moq = Number(groupQuantity);
        this.envMoq = Number(envMoq);
        this.envTimespan = Number(envTimespan);
        this.envOrderCount = Number(envOrderCount);
        this.envBuffer = Number(envBuffer);
        this._formatedData = new Map();
        this.childData = new Map();
        this.orderedSales = orderedSales;
        this.isParent = false;
        this.bufferRequired = true;
        this.childMoq = new Map();
    }

    getChildProductData(productId: number): number {
        let result = 0;
        if (this.childData == null) {
            return result;
        }

        this.childData.forEach((value) => {
            if (value.purchaseData.has(productId)) {
                let item = value.purchaseData.get(productId);
                if (item) {
                    result += item.total_variant_order_quantity;
                }
            }
        });

        return result;
    }

    calculateAllData(childData: Map<number, ChildDataItem> | null = null): {
        productCalculations: Map<number, ProductData>;
        orderQuantity: number;
        orderedSales: Map<number, number>;
    } {
        this.childData = childData;
        this.isParent = this.childData != null;
        Log.toFile('childData', (this.childData != null).toString());
        Log.toFile('isParent', this.isParent.toString());
        Log.toFile('', "SalesDataCalculator Data : ", JSON.stringify(this._data));

        if (this.isGroup) {
            this.getAllSales();
            this.getGroupSalesPerDay();
        }

        for (let i = 0; i < this._data.length; i++) {
            let productData = this._data[i];
            productData.available_quantity = productData.available_quantity + productData.arriving_quantity;

            if (productData.product_calculation_type == null || productData.product_calculation_type == undefined) {
                productData.product_calculation_type = 0;
            }

            if (productData.product_calculation_type == 0) {
                productData.product_calculation_type = productData.parent_type;
                productData.analysed_period = productData.parent_analysed_period;
                productData.min_order_count = productData.parent_order_count;
                productData.buffer = productData.parent_buffer;
                productData.wh_moq = productData.parent_wh_moq;
            }

            if (productData.product_calculation_type == 2) {
                if (this._data[i].available_quantity < this._data[i].wh_moq) {
                    this._data[i].total_variant_order_quantity = this._data[i].wh_moq - this._data[i].available_quantity;
                }
                else {
                    this._data[i].total_variant_order_quantity = 0;
                }
            }

            if (this._data[i].product_calculation_type == 3) {
                  //imti sandelio likucius ir patikrinti ar avalable kiekis minusinis ( tai kiek truksta iki available 0 ) 
                // nes mums nesvarbu ar preke apmoketa ar ne , imam kiek truksta

                if (this._data[i].available < 0) {
                    this._data[i].total_variant_order_quantity = this._data[i].available_quantity * -1;
                }
                else {
                    this._data[i].total_variant_order_quantity = 0;
                }
            }

            if (this._data[i].product_calculation_type == 4) {
                // imam tik apmoketas prekes - available kieki padidinam rezervuotu prekiu kiekiu. 
                if (this._data[i].available_quantity + this._data[i].reserved_quantity < 0) {
                    this._data[i].total_variant_order_quantity = (this._data[i].available_quantity + this._data[i].reserved_quantity) * -1;
                }
                else {
                    this._data[i].total_variant_order_quantity = 0;
                }
            }

            Log.toFile("", `This_Data[${i}] :`, this._data[i]);

            if (this._data[i].product_calculation_type == 1) {
                this._data[i].total_variant_order_quantity = 0;
                if (this.isGroup) {
                    this.getOrderedSales(i);
                    this.getSalesPercentage(i);
                    this.getRemainingStockDays(i);
                    this.getSalesUntilFirstArrival(i);
                    this.getRemainingStockAfterFirstArrival(i);
                    this.getSalesUntilSecondArrival(i);
                    this.getRemainingStockAfterSecondArrival(i); //0
                     //(rekursine funcija turi cia prasisukti kur susumuojam kiekvieno sandelio poreiki )
                    this.getStockNeededBetweenOrders(i);//P
                    this.backorderCalculation(i);
                     // toliau tik tada jei grupinis skaiciavimas
                    this.getStockSurplusOnSecondOrderArrival(i);//Q
                    this.getProductSelloutProportion(i);//R
                    this.getNeededVariantQuantity(i);//T
                    this.getProductSelloutProportionIndex(i);//U
                    let productSelloutQuantity = this.getCombinedNeededStockQuantity(i);//V -- perskaiciuojam U reiksme
                    this.orderQuantity += productSelloutQuantity;
                    this.finalOrderQuantity = this.orderQuantity;
                      // issisaugom isskaiciuota reiksme pries pritempdami kiekius iki tiekejo reikalaujamo moq
                    this._data[i].total_variant_order_quantity_initial = this._data[i].total_variant_order_quantity;
                }
                else {
                    this.getOrderedSales(i);
                    this.getSingleSalesPerDay(i);
                    this.getRemainingStockDays(i);
                    this.getSalesUntilFirstArrival(i);
                    this.getRemainingStockAfterFirstArrival(i);
                    this.getSalesUntilSecondArrival(i);
                    this.getRemainingStockAfterSecondArrival(i);//O
                    this.getStockNeededBetweenOrders(i);//P
                    this.backorderCalculation(i);
                    this._data[i].total_variant_order_quantity = this._data[i].stock_needed_between_orders;
                    this._data[i].needed_variant_quantity = this._data[i].stock_needed_between_orders;
                }
            }
            this._formatedData.set(this._data[i].product_id, this._data[i]);
        }

        Log.toCsv("calcBeforeIf", this._data, true);

        if (!this.readData) {
            if (this.moq != null && this.finalOrderQuantity < this.moq) {
                this.moqGroupCalculation();
            }
        }

        for (let key = 0; key < this._data.length; key++) {
            if (this._data[key].total_variant_order_quantity === Infinity) {
                this._data[key].total_variant_order_quantity = 0;
            }

            this.bufferCalculation(key);// priskaiciuojam bufferi
            this.ceilMoq(key);// paimam didesni kieki tarp moq, kmeans ar isskaiciuoto kieko

             // jei isskaiciuotas kiekis yra tarp 0 ir 1, tai vistiek darom bent vienos prekes uzsakyma
            if (this._data[key].divisible == 0) {
                if (this._data[key].total_variant_order_quantity !== undefined) {
                    this._data[key].total_variant_order_quantity = Math.ceil(this._data[key].total_variant_order_quantity);
                }
            }
        }

        Log.toCsv("calcAfterIf", this._data, false);

        return {
            productCalculations: this._formatedData,
            orderQuantity: this.finalOrderQuantity,
            orderedSales: this.orderedSales
        };
    }

    private getOrderedSales(index: number): void {
        if (this.orderedSales.has(this._data[index].product_id)) {
            let value = 0;
            value = Number(this.orderedSales.get(this._data[index].product_id));
            let orderedvalue = Number(this._data[index].ordered_sales);
            value += orderedvalue;
            this.orderedSales.set(this._data[index].product_id, value);
        }
        else {
            this.orderedSales.set(this._data[index].product_id, this._data[index].ordered_sales);
        }

        if (this.isParent == true) {
            let value = 0;
            value = Number(this._data[index].sales) + Number(this.orderedSales.get(this._data[index].product_id));
            this._data[index].sales = value;
            Log.toFile('addedOrdered', `Product : ${this._data[index].product_id} , Sales : ${this._data[index].sales}`);
        }
    }

    // jei isskaiciutoas kiekis gaunasi mazesnis nei reikalauja tiekejas - 
    // tuoment proporcingai didinam kiekvienos prekes kieki kol pasiekima reikiama kieki 
    private moqGroupCalculation(): void {
        this.orderedStockSufficiency = this.moq / this.salesPerDayAverage;
          // TODO: patikrinti kiek prekiu priskaiciavo, jei prekiu nedaug - galimai reiks skipinti uzsakyma.
        while (this.finalOrderQuantity < this.moq && this.orderedStockSufficiency > 1) {
            this.tempMoq -= this.orderQuantity;
            this.orderedStockSufficiency = this.tempMoq / this.salesPerDayAverage;
            this.orderQuantity = 0;
            this.cycleRecalculation();
            this.finalOrderQuantity += Number(this.orderQuantity);
        }
    }

    private getAllSales(): void {
        this.allSales = this._data.reduce((total, item) => {
            let sales = Number(item.sales);
            if (this.isParent && this.orderedSales.has(item.product_id)) {
                sales += this.orderedSales.get(item.product_id) || 0;
            }
            return total + sales + item.ordered_sales;
        }, 0);
    }

    private getGroupSalesPerDay(): void {
        //H
        // kiek per viena pardavimo diena parduodama prekiu ( pardavimo diena - kai produktas buvo sandelyje)
        for (let index = 0; index < this._data.length; index++) {
            this._data[index].sales_per_day = this._data[index].sales / this._data[index].days_in_stock;
            this.salesPerDayAverage += Number(this._data[index].sales_per_day);
        }
        Log.toFile('', "getGroupSalesPerDay : ", JSON.stringify(this.salesPerDayAverage));
    }

    private getSingleSalesPerDay(index: number): void {
        this._data[index].sales_per_day = this._data[index].sales / this._data[index].days_in_stock;
        if (this._data[index].sales == 0 && this._data[index].days_in_stock == 0) {
            this._data[index].sales_per_day = 0;
        }
        Log.toFile('', "getSingleSalesPerDay : ", JSON.stringify(this._data[index].sales_per_day));
    }

    private getSalesPercentage(index: number): void {
          //I
        this._data[index].sales_percentage = this._data[index].sales / this.allSales;
    }

    private getRemainingStockDays(index: number): void {
         //K
        if (this._data[index].available_quantity <= 0) {
            this._data[index].remaining_stock_days = 0;
        }
        else {
            this._data[index].remaining_stock_days = this._data[index].available_quantity / (this._data[index].sales_per_day || 0);
        }
        Log.toFile('', "getRemainingStockDays : ", JSON.stringify(this._data[index].remaining_stock_days));
    }

    private getSalesUntilFirstArrival(index: number): void {
         //L
        if (!this.readData) {
            this._data[index].sales_until_first_arrival = Math.round((this._data[index].sales_per_day || 0) * (this.orderArrivalDays || 0));
            this._data[index].first_order_arrival_days = this.orderArrivalDays || 0;
        }
        else {
            this._data[index].sales_until_first_arrival = Math.round((this._data[index].sales_per_day || 0) * (this._data[index].first_order_arrival_days || 0));
        }
        Log.toFile('', "getSalesUntilFirstArrival : ", JSON.stringify(this._data[index].sales_until_first_arrival));
    }

    private getRemainingStockAfterFirstArrival(index: number): void {
        //M
        if (this._data[index].remaining_stock_after_first_arrival == undefined) {
            this._data[index].remaining_stock_after_first_arrival = this._data[index].available_quantity - (this._data[index].sales_until_first_arrival || 0);
        }
        else {
            this._data[index].remaining_stock_after_first_arrival += this._data[index].available_quantity - (this._data[index].sales_until_first_arrival || 0);
        }
        Log.toFile('', "getRemainingStockAfterFirstArrival : ", JSON.stringify(this._data[index].remaining_stock_after_first_arrival));
    }

    private getSalesUntilSecondArrival(index: number): void {
        //N 
        if (!this.readData) {
            this._data[index].sales_until_second_arrival = Math.round((this._data[index].sales_per_day || 0) * (this.secondArrivalDays || 0));
            this._data[index].second_order_arrival_days = this.secondArrivalDays || 0;
        }
        else {
            this._data[index].sales_until_second_arrival = Math.round((this._data[index].sales_per_day || 0) * (this._data[index].second_order_arrival_days || 0));
        }
        Log.toFile('', "getSalesUntilSecondArrival : ", JSON.stringify(this._data[index].sales_until_second_arrival));
    }

    private getRemainingStockAfterSecondArrival(index: number): void { 
        // O 
        let remainingStockAfterFirstArrival = this._data[index].remaining_stock_after_first_arrival || 0;
        let salesUntilSecondArrival = this._data[index].sales_until_second_arrival || 0;
        let remainingStockAfterSecondArrival = remainingStockAfterFirstArrival - salesUntilSecondArrival;

        if (this._data[index].remaining_stock_after_second_arrival == undefined) {
            this._data[index].remaining_stock_after_second_arrival = remainingStockAfterSecondArrival;
        }
        else {
            this._data[index].remaining_stock_after_second_arrival += remainingStockAfterSecondArrival;
        }
    }

    private getStockNeededBetweenOrders(index: number): void {
        //P  
        let result = this.getChildProductData(this._data[index].product_id);

        if (this._data[index].remaining_stock_after_second_arrival !== undefined && this._data[index].remaining_stock_after_second_arrival < 0) {
            result += Math.ceil(this._data[index].remaining_stock_after_second_arrival * -1);
        }
        else if (this._data[index].remaining_stock_after_second_arrival !== undefined) {
            result = this._data[index].remaining_stock_after_second_arrival - result;
            if (result < 0) {
                result = result * -1;
            }
            else {
                result = 0;
            }
        }

        this._data[index].stock_needed_between_orders = result; //+ visi childu between_orders ( P stulpelis )
    }

    private ceilMoq(index: number): void {
         // cia ateina jau su ivertintu moq, tada jeigu kmeans gaunasi didesnis , prskiriam ji ( only if product calc type ne 1 type!)
        if (this._data[index].product_calculation_type != 1) {
            this._data[index].total_variant_order_quantity = this.getMaxKmeansMoq(
                this._data[index].total_variant_order_quantity || 0,
                this._data[index].kmeans_centroid
            );
            return;
        }

        if (!this.isParent) {
            let chMoq = this.getMaxKmeansMoq(this._data[index].wh_moq, this._data[index].kmeans_centroid);
            if (this.childMoq.has(this._data[index].product_id)) {
                this.childMoq.set(this._data[index].product_id, (this.childMoq.get(this._data[index].product_id) || 0) + chMoq);
            }
            else {
                this.childMoq.set(this._data[index].product_id, chMoq);
            }
            return;
        }
        // Jeigu prekiu truksta iki visu sandeliu minimumu -tada paimam mum trukstama moq
        let moq = this.getMaxKmeansMoq(this._data[index].wh_moq, this._data[index].kmeans_centroid) + (this.childMoq.get(this._data[index].product_id) || 0);

        if ((this._data[index].total_variant_order_quantity || 0) < moq) {
            this._data[index].total_variant_order_quantity = moq;
        }
    }

    private getStockSurplusOnSecondOrderArrival(index: number): void {
        //Q
        let result = 0;
        if (this._data[index].remaining_stock_after_second_arrival !== undefined && this._data[index].remaining_stock_after_second_arrival > 0) {
            result = this._data[index].remaining_stock_after_second_arrival;
        }
        this._data[index].stock_surplus_until_second_order_arrival = result;
        Log.toFile('', "getStockSurplusOnSecondOrderArrival : ", JSON.stringify(this._data[index].stock_surplus_until_second_order_arrival));
    }

    private getProductSelloutProportion(index: number): void {
         //R
        this._data[index].product_sellout_proportion = ((this._data[index].stock_surplus_until_second_order_arrival || 0) / (this._data[index].sales_per_day || 1)) / this.orderedStockSufficiency;
        Log.toFile('', "getProductSelloutProportion : ", JSON.stringify(this._data[index].product_sellout_proportion));
    }

    private getNeededVariantQuantity(index: number): void {
         //T
        this._data[index].needed_variant_quantity = this.tempMoq * (this._data[index].sales_percentage || 0);
        Log.toFile('', "getNeededVariantQuantity : ", JSON.stringify(this._data[index].needed_variant_quantity));
    }

    private getProductSelloutProportionIndex(index: number): number {
         //U
        if ((this._data[index].product_sellout_proportion || 0) < 1) {
            this._data[index].product_sellout_quantity = Math.ceil((1 - (this._data[index].product_sellout_proportion || 0)) * (this._data[index].needed_variant_quantity || 0));
        }
        else {
            this._data[index].product_sellout_quantity = 0;
        }

        if (this._data[index].total_variant_order_quantity !== undefined) {
            this._data[index].total_variant_order_quantity += this._data[index].product_sellout_quantity || 0;
            Log.toFile('', "getProductSelloutProportionIndex : ", JSON.stringify(this._data[index].product_sellout_quantity));
            return Number(this._data[index].product_sellout_quantity || 0);
        }
        return 0;
    }

    private getCombinedNeededStockQuantity(index: number): number {
         //V
        this._data[index].product_sellout_quantity = Number((this._data[index].stock_needed_between_orders || 0) + (this._data[index].product_sellout_quantity || 0));
        this._data[index].total_variant_order_quantity = this._data[index].product_sellout_quantity;
        Log.toFile('', "getCombinedNeededStockQuantity : ", JSON.stringify(this._data[index].product_sellout_quantity));
        return Number(this._data[index].product_sellout_quantity || 0);
    }

    private cycleRecalculation(): void {
        for (let i = 0; i < this._data.length; i++) {
            this._data[i].stock_surplus_until_second_order_arrival = (this._data[i].stock_surplus_until_second_order_arrival || 0) +
                Math.ceil(this._data[i].product_sellout_quantity || 0) -
                Math.ceil(this.orderedStockSufficiency * (this._data[i].sales_per_day || 0));

            if ((this._data[i].stock_surplus_until_second_order_arrival || 0) < 0) {
                this._data[i].stock_surplus_until_second_order_arrival = 0;
            }

            this.getProductSelloutProportion(i);
            this.getNeededVariantQuantity(i);
            this.orderQuantity += this.getProductSelloutProportionIndex(i);
            this._formatedData.set(this._data[i].product_id, this._data[i]);
        }
        Log.toFile('', "cycleRecalculation : ", JSON.stringify(this._data));
    }

    private bufferCalculation(index: number): void {
        // buffer calculation
        //SALES PER DAY * BUFFER 
        if (this.isParent) {
             // jeigu pradinis kiekis su buferiu yra didesnis nei pritemptas kiekis iki moq , imam pradinio kiekio su buferiu kieki
            this._data[index].total_variant_copy = this._data[index].total_variant_order_quantity;
            let result = (this._data[index].total_variant_order_quantity_initial || 0) * this._data[index].buffer;
            if (result > (this._data[index].total_variant_order_quantity || 0)) {
                this._data[index].total_variant_order_quantity = result;
            }
            this._data[index].buffer_after_calc = this._data[index].total_variant_order_quantity;
        }
    }

    private getMaxKmeansMoq(warehouseMoq: number, kmeansCentroid: number): number {
        if (warehouseMoq != null && warehouseMoq > 0) {
            return Math.max(warehouseMoq, kmeansCentroid);
        }
        else {
            return 0;
        }
    }

    private backorderCalculation(index: number): void {
        if (this._data[index].backorder == 0 && (this._data[index].remaining_stock_after_first_arrival || 0) < 0) {
            this._data[index].stock_needed_between_orders = (this._data[index].stock_needed_between_orders || 0) - ((this._data[index].remaining_stock_after_first_arrival || 0) * -1);
        }
    }
}

export default SalesDataCalculator;
