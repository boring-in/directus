
import Log from '../class/Log';
class SalesDataCalculator {
    // this function is used to calculate sales data for products
    // it takes in data, isGroup, groupQuantity, orderArrivalDays, secondArrivalDays, envMoq, envTimespan, envOrderCount, envBuffer, calculationType
    // data - product data in array
    // isGroup - boolean value, if true, then it is group calculation, if false, then it is single calculation
    // groupQuantity - global MOQ value for a group
    // orderArrivalDays - days until first order arrives
    // secondArrivalDays - days until second order arrives
    // envMoq - global MOQ value for a group set in environment
    // envTimespan - global timespan value for a group set in environment
    // envOrderCount - global order count value for a group set in environment
    // envBuffer - global buffer value for a group set in environment
    // calculationType - calculation type for a product
    // returns formated data
    
   
    // 
    //
    // 
    //
    //
    constructor(data, isGroup, groupQuantity = 0, orderArrivalDays = null, secondArrivalDays = null, envMoq = null, envTimespan = null, envOrderCount = null, envBuffer = null,  orderedSales) {
        this.readData = false;
        this.isGroup = isGroup;
        this._data = data;
        this.orderArrivalDays = orderArrivalDays;
        this.secondArrivalDays = secondArrivalDays;
        if (this.orderArrivalDays == null) {
            this.readData = true; // read data flagas naudajams order arrival days imam is product informacijos , ( nera paduotas i konsturktoriu)
        }
        // if (groupQuantity != null) { 
        //     this.isGroup = true;
        // }
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

    getChildProductData(productId){

        let result = 0;
        if(this.childData == null){
            return result;
        }
       
        this.childData.forEach((value, key) => {
        
            if (value.purchaseData.has(productId)){
             
                let item = value.purchaseData.get(productId);
                result += item.total_variant_order_quantity;
                
            }
            
        });
        
        return result;
    }
  

    calculateAllData(childData = null){ 

        this.childData = childData;
        this.isParent = this.childData != null ;
        Log.toFile('childData',(this.childData != null));
        Log.toFile('isParent',this.isParent);
        Log.toFile('', "SalesDataCalculator Data : " , JSON.stringify(this._data));
        if (this.isGroup) {
            this.getAllSales();
            this.getGroupSalesPerDay();
        }
        for (let i = 0; i < this._data.length; i++) {
            
            let productData = this._data[i];
            //TODO : pakeisti kad arriving quantity po kiek dienu atvaziuos , ir tuomet ta kieki pridet 
            // arba prie remaining stock after first arrival arba prie remaining stock after second arrival
            // su atskiru sql paimti po kiek dienu atvyks sitos arriving quantity prekes
            // jeigu atvykimo laikas telpa i pirma arrival days - priedam arriving quantity i remaining stock after first arrival
            // jeigu atvykimo laikas telpa i antra arrival days - priedam arriving quantity i remaining stock after second arrival
            // jeigu ilgesnis uz abu - neimam i skaiciavimus
            //(arriving quantity - tiek is tiekeju tiek is parent sandeliu ! ( purchase ir transfer))
            productData.available_quantity = productData.available_quantity + productData.arriving_quantity;

            if (productData.product_calculation_type == null || productData.product_calculation_type == undefined) {

                productData.product_calculation_type = 0;
            }

            if (productData.product_calculation_type == 0) { //  <---- jau pareina viskas is sql

                productData.product_calculation_type = productData.parent_type;
                productData.analysed_period = productData.parent_analysed_period;
                productData.min_order_count = productData.parent_order_count;
                productData.buffer = productData.parent_buffer;
                productData.wh_moq = productData.parent_wh_moq;
         
            }

            if (productData.product_calculation_type == 2) {
            
                if(this._data[i].available_quantity < this._data[i].wh_moq){ 
                    this._data[i].total_variant_order_quantity = this._data[i].wh_moq - this._data[i].available_quantity;
                }
                else{
                    this._data[i].total_variant_order_quantity = 0;
                }   

            }

            if (this._data[i].product_calculation_type == 3) {
                //imti sandelio likucius ir patikrinti ar avalable kiekis minusinis ( tai kiek truksta iki available 0 ) nes mums nesvarbu ar preke apmoketa ar ne , imam kiek truksta

                if (this._data[i].available < 0) {
                    this._data[i].total_variant_order_quantity =
                        this._data[i].available_quantity * -1;
                }
                else {
                    this._data[i].total_variant_order_quantity = 0;
                }
            }

            if (this._data[i].product_calculation_type == 4) {
                // imam tik apmoketas prekes - available kieki padidinam rezervuotu prekiu kiekiu. 
                if (this._data[i].available_quantity + this._data[i].reserved_quantity <
                    0) {
                    this._data[i].total_variant_order_quantity =
                       ( this._data[i].available_quantity +
                            this._data[i].reserved_quantity) * -1;
                }
                else {
                    this._data[i].total_variant_order_quantity = 0;
                }
            }

            Log.toFile("", `This_Data[${i}] :` , this._data[i]);

            if (this._data[i].product_calculation_type == 1) {
                this._data[i].total_variant_order_quantity = 0;
               // Log.toFile(''," SalesDataCalculator Is calulating group ? :" , this.isGroup);
                if (this.isGroup) {
                    this.getOrderedSales(i); 
                    this.getSalesPercentage(i);
                    this.getRemainingStockDays(i);
                    this.getSalesUntilFirstArrival(i);
                    this.getRemainingStockAfterFirstArrival(i);
                    this.getSalesUntilSecondArrival(i);
                    this.getRemainingStockAfterSecondArrival(i); //O
                    //(rekursine funcija turi cia prasisukti kur susumuojam kiekvieno sandelio poreiki )
                    this.getStockNeededBetweenOrders(i); //P
                    this.backorderCalculation(i); 
                    // toliau tik tada jei grupinis skaiciavimas
                    this.getStockSurplusOnSecondOrderArrival(i); //Q
                    this.getProductSelloutProportion(i); //R
                    this.getNeededVariantQuantity(i); //T
                    this.getProductSelloutProportionIndex(i); //U
                    let productSelloutQuantity = this.getCombinedNeededStockQuantity(i); //V -- perskaiciuojam U reiksme
                    this.orderQuantity += productSelloutQuantity;
                   
                    //this.moqSingleCalculation(i); // kvieciam tik tokiu atvjeu , jei yra grupinis skaiciavimas
                    this.finalOrderQuantity = this.orderQuantity;
                    // issisaugom isskaiciuota reiksme pries pritempdami kiekius iki tiekejo reikalaujamo moq
                    this._data[i].total_variant_order_quantity_initial = this._data[i].total_variant_order_quantity;
                }
                else {
                    //  this.getSalesPercentage(i); //  pirmo tipo skaiciavimams neveikia
                    this.getOrderedSales(i);
                    this.getSingleSalesPerDay(i); //
                    this.getRemainingStockDays(i);
                    this.getSalesUntilFirstArrival(i);
                    this.getRemainingStockAfterFirstArrival(i);
                    this.getSalesUntilSecondArrival(i);
                    this.getRemainingStockAfterSecondArrival(i);
                    this.getStockNeededBetweenOrders(i); //P
                    this.backorderCalculation(i); 
                    this._data[i].total_variant_order_quantity = this._data[i].stock_needed_between_orders;
                    this._data[i].needed_variant_quantity = this._data[i].stock_needed_between_orders;
                    
                  //  this.moqSingleCalculation(i);
                   // this._data[i].needed_variant_quantity  = this._data[i].total_variant_order_quantity;
                   // i uzsakyma surasyti total_variant_order_quantity
                }
            }
            //this._formatedData[this._data[i].product_id] = {};
            //this._formatedData[this._data[i].product_id] = this._data[i];
            this._formatedData.set(this._data[i].product_id, this._data[i]);
         
        }
        Log.toCsv("calcBeforeIf", this._data,true);
        if (!this.readData) {
            if (this.moq != null && this.finalOrderQuantity < this.moq) {
//this.bufferRequired = false;
                this.moqGroupCalculation();
               
            }
        }
        
        for (let key = 0; key < this._data.length; key++) {  
            if (this._data[key].total_variant_order_quantity == Infinity) {
                this._data[key].total_variant_order_quantity = 0;
            }

            this.bufferCalculation(key); // priskaiciuojam bufferi
            this.ceilMoq(key);// paimam didesni kieki tarp moq, kmeans ar isskaiciuoto kieko
            
            // jei isskaiciuotas kiekis yra tarp 0 ir 1, tai vistiek darom bent vienos prekes uzsakyma
            if(this._data[key].divisible == 0){
                this._data[key].total_variant_order_quantity = Math.ceil(this._data[key].total_variant_order_quantity);
            }
            
            
        };

        Log.toCsv("calcAfterIf", this._data,false);
        
   
        return {productCalculations:this._formatedData, orderQuantity:this.finalOrderQuantity, orderedSales:this.orderedSales};
    }

    getOrderedSales(index){
        if(this.orderedSales.has(this._data[index].product_id)){
            let value = 0;
            value = Number(this.orderedSales.get(this._data[index].product_id)) ;
            let orderedvalue =  Number(this._data[index].ordered_sales);
            value += orderedvalue;
            this.orderedSales.set(this._data[index].product_id,value);
        }   
        else{

            this.orderedSales.set(this._data[index].product_id, this._data[index].ordered_sales);
        }
        
        if(this.isParent == true){
            let value = 0;
            value = Number( this._data[index].sales) + Number(this.orderedSales.get(this._data[index].product_id));
            this._data[index].sales = value;
            Log.toFile('addedOrdered',`Product : ${this._data[index].product_id} , Sales : ${this._data[index].sales}`);
        }
    };

    // jei isskaiciutoas kiekis gaunasi mazesnis nei reikalauja tiekejas - 
    // tuoment proporcingai didinam kiekvienos prekes kieki kol pasiekima reikiama kieki 
    moqGroupCalculation() {
        //recalculation
        this.orderedStockSufficiency = this.moq / this.salesPerDayAverage;
        // TODO: patikrinti kiek prekiu priskaiciavo, jei prekiu nedaug - galimai reiks skipinti uzsakyma.
        while (this.finalOrderQuantity < this.moq &&
            this.orderedStockSufficiency > 1) {
        
            this.tempMoq -= this.orderQuantity;
            this.orderedStockSufficiency = this.tempMoq / this.salesPerDayAverage;
            this.orderQuantity = 0;
            this.cycleRecalculation();
            this.finalOrderQuantity += Number(this.orderQuantity);
        }
    }

    // moqSingleCalculation(index) {
        
     
    //     this._data[index].total_variant_order_quantity = Math.max(this._data[index].needed_variant_quantity, this._data[index].wh_moq, this._data[index].kmeans_centroid); // jei reikia daugiau nei reikia - uzsakom daugiau
   
    // }

    getAllSales() {
        this.allSales = this._data.reduce((total, item) => {
          let sales = Number(item.sales);
          if (this.isParent && this.orderedSales.has(item.product_id)) {
            sales += this.orderedSales.get(item.product_id);
          }
          return total + sales + item.ordered_sales;
        }, 0);
        
      }

    getGroupSalesPerDay() {
        //H
        // kiek per viena pardavimo diena parduodama prekiu ( pardavimo diena - kai produktas buvo sandelyje)
        for (let index = 0; index < this._data.length; index++) {
            this._data[index].sales_per_day =
                this._data[index].sales / this._data[index].days_in_stock;
            this.salesPerDayAverage += Number(this._data[index].sales_per_day);
          
        }
       Log.toFile('', "getGroupSalesPerDay : " , JSON.stringify(this.salesPerDayAverage));
       
    }
    getSingleSalesPerDay(index) {
        this._data[index].sales_per_day = this._data[index].sales / this._data[index].days_in_stock; // H column calculation
        if(this._data[index].sales==0 && this._data[index].days_in_stock==0){
            this._data[index].sales_per_day = 0;
        }
        Log.toFile('', "getSingleSalesPerDay : " , JSON.stringify(this._data[index].sales_per_day));
    }
    getSalesPercentage(index) {
        //I
        this._data[index].sales_percentage = this._data[index].sales / this.allSales;
        
    
       
    }
    getRemainingStockDays(index) {
        //K
        if (this._data[index].available_quantity <= 0) {
            this._data[index].remmaining_stock_days = 0;
        }
        else {
            this._data[index].remaining_stock_days =
                this._data[index].available_quantity / this._data[index].sales_per_day;
        }
      Log.toFile('', "getRemainingStockDays : " , JSON.stringify(this._data[index].remaining_stock_days));
    }
    getSalesUntilFirstArrival(index) {
        //L

        if (!this.readData) {
            // kadangi skaiciuojam du atvykimo ciklus, todel darom matematini suapvalinima, nes vienam cikle gali gautis daugiau viena preke , kitam maziau
            this._data[index].sales_until_first_arrival = Math.round(this._data[index].sales_per_day * this.orderArrivalDays); 
            this._data[index].first_order_arrival_days = this.orderArrivalDays;
        }
        else {
            this._data[index].sales_until_first_arrival = Math.round(this._data[index].sales_per_day *
                this._data[index].first_order_arrival_days);
        }
        Log.toFile('', "getSalesUntilFirstArrival : " , JSON.stringify(this._data[index].sales_until_first_arrival));
    }
    getRemainingStockAfterFirstArrival(index) {
        //M
            if(this._data[index].remaining_stock_after_first_arrival == undefined){
            this._data[index].remaining_stock_after_first_arrival =
                this._data[index].available_quantity -
                    this._data[index].sales_until_first_arrival;
            }
            else{
                this._data[index].remaining_stock_after_first_arrival += this._data[index].available_quantity - this._data[index].sales_until_first_arrival;
            }
        
        Log.toFile('', "getRemainingStockAfterFirstArrival : " , JSON.stringify(this._data[index].remaining_stock_after_first_arrival));
    }
    getSalesUntilSecondArrival(index) {
         
        //N 
        if (!this.readData) {
            // kadangi skaiciuojam du atvykimo ciklus, todel darom matematini suapvalinima, nes vienam cikle gali gautis daugiau viena preke , kitam maziau
            this._data[index].sales_until_second_arrival = Math.round(this._data[index].sales_per_day * this.secondArrivalDays);
            this._data[index].second_order_arrival_days = this.secondArrivalDays;
        }
        else {
            this._data[index].sales_until_second_arrival = Math.round(this._data[index].sales_per_day *
                this._data[index].second_order_arrival_days);
        }
       Log.toFile('', "getSalesUntilSecondArrival : " , JSON.stringify(this._data[index].sales_until_second_arrival));
    }
    getRemainingStockAfterSecondArrival(index) {
        //O
        // this._data[index].remaining_stock_after_second_arrival =
        //     this._data[index].remaining_stock_after_first_arrival -
        //         this._data[index].sales_until_second_arrival;

        let remainingStockAfterFirstArrival = this._data[index].remaining_stock_after_first_arrival;
        let salesUntilSecondArrival = this._data[index].sales_until_second_arrival;
        let remainingStockAfterSecondArrival = remainingStockAfterFirstArrival - salesUntilSecondArrival;

        if(this._data[index].remaining_stock_after_second_arrival == undefined){
            this._data[index].remaining_stock_after_second_arrival = remainingStockAfterSecondArrival;
        }
        else{
            this._data[index].remaining_stock_after_second_arrival += remainingStockAfterSecondArrival;
        }

       
    }

    getStockNeededBetweenOrders(index) {
        //P     ----- sita reikse galima uzsakyti - surasyti i duonbaze
        
        let result = this.getChildProductData(this._data[index].product_id);
        //  this._data[index].stock_needed_between_orders = this._data[index].sales_until_second_arrival - this._data[index].remaining_stock_after_first_arrival;
          
        if (this._data[index].remaining_stock_after_second_arrival < 0) {
            result += Math.ceil(this._data[index].remaining_stock_after_second_arrival * -1);
        }
        else{
            result = this._data[index].remaining_stock_after_second_arrival - result;
            if(result < 0 ){
                result = result * -1;
            }
            else {
                result = 0;
            }
        }
        
        this._data[index].stock_needed_between_orders = result; //+ visi childu between_orders ( P stulpelis )
        
        // if(this.isGroup){
        //     return;
        // }

        //this._data[index] = this.ceilMoq(index);
        //this._data[index].total_variant_order_quantity += result;

    }

  
    ceilMoq(index){
        // cia ateina jau su ivertintu moq, tada jeigu kmeans gaunasi didesnis , prskiriam ji ( only if product calc type ne 1 type!)
        if(this._data[index].product_calculation_type != 1){
            this._data[index].total_variant_order_quantity = this.getMaxKmeansMoq(this._data[index].total_variant_order_quantity, this._data[index].kmeans_centroid) ;
            return ;
        }

        // if(this._data[index].wh_moq == null || this._data[index].wh_moq == 0){
        //     this._data[index].total_variant_order_quantity =  this._data[index].stock_needed_between_orders 
        //     return ;
        // }
        
        if(!this.isParent){
            let chMoq = this.getMaxKmeansMoq(this._data[index].wh_moq,this._data[index].kmeans_centroid)
            if(this.childMoq.has(this._data[index].product_id)){
                this.childMoq.set(this._data[index].product_id, this.childMoq.get(this._data[index].product_id)+ chMoq);
            }
            else{
                this.childMoq.set(this._data[index].product_id, chMoq);
            }
            return;
        }
        // Jeigu prekiu truksta iki visu sandeliu minimumu -tada paimam mum trukstama moq
        let moq = this.getMaxKmeansMoq(this._data[index].wh_moq,this._data[index].kmeans_centroid) + this.childMoq.get(this._data[index].product_id);
        
        if(this._data[index].total_variant_order_quantity < moq){
            this._data[index].total_variant_order_quantity = moq;
        }

        // if (this._data[index].remaining_stock_after_second_arrival > 0 
        //     && this._data[index].remaining_stock_after_second_arrival < this._data[index].wh_moq 
        //     && this._data[index].remaining_stock_after_second_arrival < this._data[index].kmeans_centroid) {
        //    // this._data[index].total_variant_order_quantity = result;
          
        //    this._data[index].total_variant_order_quantity = this.getMaxKmeansMoq(this._data[index].wh_moq, this._data[index].kmeans_centroid) - this._data[index].remaining_stock_after_second_arrival;           // this._data[index].total_variant_order_quantity =  this._data[index].total_variant_order_quantity < 0 ? 0 : this._data[index].total_variant_order_quantity ;
        // }
        // else {
            
        //     // getMaxKmeans result > uz total_variant_order_quantity - pridedam skirtuma ,
        //     this._data[index].total_variant_order_quantity += this.getMaxKmeansMoq(this._data[index].wh_moq, this._data[index].kmeans_centroid);
        // }
        
    }

    getStockSurplusOnSecondOrderArrival(index) {
        //Q
        let result = 0;
        //this._data[index].stock_surplus_until_second_order_arrival = this._data[index].remaining_stock_after_first_arrival - this._data[index].sales_until_second_arrival;
        if (this._data[index].remaining_stock_after_second_arrival > 0) {
            result = this._data[index].remaining_stock_after_second_arrival;
        }
        this._data[index].stock_surplus_until_second_order_arrival = result;
        Log.toFile('', "getStockSurplusOnSecondOrderArrival : " , JSON.stringify(this._data[index].stock_surplus_until_second_order_arrival));
    }
    getProductSelloutProportion(index) {
        //R
        this._data[index].product_sellout_proportion =
            this._data[index].stock_surplus_until_second_order_arrival /
                this._data[index].sales_per_day /
                this.orderedStockSufficiency;
       Log.toFile('', "getProductSelloutProportion : " , JSON.stringify(this._data[index].product_sellout_proportion));
    }
    getNeededVariantQuantity(index) {
        //T
        this._data[index].needed_variant_quantity =
            this.tempMoq * this._data[index].sales_percentage;//nan
           Log.toFile('', "getNeededVariantQuantity : " , JSON.stringify(this._data[index].needed_variant_quantity));
    }
    getProductSelloutProportionIndex(index) {
        //U
        if (this._data[index].product_sellout_proportion < 1) {
            this._data[index].product_sellout_quantity = Math.ceil((1 - this._data[index].product_sellout_proportion) *
                this._data[index].needed_variant_quantity);
        }
        else {
            this._data[index].product_sellout_quantity = 0;
        }
        if (this._data[index].total_variant_order_quantity != undefined) {
            this._data[index].total_variant_order_quantity +=
                this._data[index].product_sellout_quantity;
       Log.toFile('', "getProductSelloutProportionIndex : " , JSON.stringify(this._data[index].product_sellout_quantity));
        return Number(this._data[index].product_sellout_quantity);
      
    }
}
    getCombinedNeededStockQuantity(index) {
        //V
        this._data[index].product_sellout_quantity = Number(this._data[index].stock_needed_between_orders +
            this._data[index].product_sellout_quantity);
        this._data[index].total_variant_order_quantity =
            this._data[index].product_sellout_quantity;
      Log.toFile('', "getCombinedNeededStockQuantity : " , JSON.stringify(this._data[index].product_sellout_quantity));
        return Number(this._data[index].product_sellout_quantity);
    }
    
    cycleRecalculation() {
     
        for (let i = 0; i < this._data.length; i++) {
            this._data[i].stock_surplus_until_second_order_arrival =
                this._data[i].stock_surplus_until_second_order_arrival +
                    Math.ceil(this._data[i].product_sellout_quantity) -
                    Math.ceil(this.orderedStockSufficiency * this._data[i].sales_per_day); // prskaiciuojam Q
            if (this._data[i].stock_surplus_until_second_order_arrival < 0) {
                this._data[i].stock_surplus_until_second_order_arrival = 0;
            }
           
            // this._data[i].product_sellout_quantity
            // this._data[i].combined_needed_stock_quantity = 0; // reset V
            this.getProductSelloutProportion(i); // R
            this.getNeededVariantQuantity(i); //T
            this.orderQuantity += this.getProductSelloutProportionIndex(i); // U
            // this.getCombinedNeededStockQuantity(i); // V
            this._formatedData.set(this._data[i].product_id, this._data[i]);
        }
        Log.toFile('', "cycleRecalculation : " , JSON.stringify(this._data)); 
    }
    bufferCalculation(index) {
        // buffer calculation
        //SALES PER DAY * BUFFER 
        if(this.isParent ){

            // jeigu pradinis kiekis su buferiu yra didesnis nei pritemptas kiekis iki moq , imam pradinio kiekio su buferiu kieki
            this._data[index].total_variant_copy = this._data[index].total_variant_order_quantity;
            let result = this._data[index].total_variant_order_quantity_initial * this._data[index].buffer;
            if(result > this._data[index].total_variant_order_quantity){
                this._data[index].total_variant_order_quantity = result;
            }
            
           //for debug purposes
           // this._data[index].total_variant_order_quantity = this._data[index].total_variant_order_quantity * this._data[index].buffer;
            this._data[index].buffer_after_calc =this._data[index].total_variant_order_quantity;
           // this._data[index].buffer_copy = this._data[index].buffer;
        }
 
      // Log.toFile('', "bufferCalculation : " , JSON.stringify(this._data[index].sales_per_day));
    }

    getMaxKmeansMoq(warehouseMoq, kmeansCentroid){
            if (warehouseMoq != null && warehouseMoq > 0){
                return Math.max(warehouseMoq, kmeansCentroid);
            }
            else{
                return 0;
            }

        }

    backorderCalculation(index){
        if (this._data[index].backorder == 0 && this._data[index].remaining_stock_after_first_arrival < 0) {
          //  this._data[index].total_variant_order_quantity -=  this._data[index].remaining_stock_after_first_arrival * -1 ;
            this._data[index].stock_needed_between_orders -= this._data[index].remaining_stock_after_first_arrival * -1;
        }
    }
}

export default SalesDataCalculator;







