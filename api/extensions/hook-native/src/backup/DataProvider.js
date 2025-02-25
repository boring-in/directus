

//import fs from "fs";
import Constants from "../const/Constants";

class DataProvider {
    constructor(database) {
        
        this._database = database;
    }
 
    async getEnvValues() {
        //let env = useEnv();
        let envJosn = {
            transfer_default_calculation_type: Constants.defaultCalculationType,
            transfer_calculations_timespan: Constants.defaultCalculationTimespan,
            transfer_calculations_order_count: Constants.defaultCalculationOrderCount,
            transfer_calculations_buffer: Constants.defaultCalculationBuffer,
            transfer_calculations_moq: Constants.defaultCalculationMoq,
        };
        return envJosn;
    }

    async getStockReplenishmentProductsStock(replenishmentId) {
        let query = ` select s.id as stock,(s.onhand_quantity + srp.quantity) as onhand from stock_replenishment_products srp
 left join stock_replenishment sr on sr.id = srp.stock_replenishment 
 left join stock s on s.warehouse = sr.warehouse and s.product = srp.product 
 where sr.id = ${replenishmentId};`
        let databaseData = await this._database.raw(query);
        let stockReplenishmentProductsStock = this.scrubData(databaseData);
        return stockReplenishmentProductsStock;


    }
    async getLastTransferStatus(transferId) {
        let query = `SELECT * from transfer_status_history where transfer = ${transferId} order by id desc limit 1`;
        let databaseData = await this._database.raw(query);
        let transferStatus;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            transferStatus = this.mariaDbToJSON(databaseData);
        }
        else {
            transferStatus = databaseData.rows;
        }
        if(transferStatus.length > 0){
        return transferStatus[0].transferStatus;
        }
        else{
            return null;
        }

    }
    async getStockTransferProducts(transferId){
        let query = `SELECT product, transfer_quantity from stock_transfer_products where stock_transfer = ${transferId}`;
        let databaseData = await this._database.raw(query);
        let stockTransferProducts;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            stockTransferProducts = this.mariaDbToJSON(databaseData);
        }
        else {
            stockTransferProducts = databaseData.rows;
        }
        return stockTransferProducts;


    }

    async checkOrderStock(orderId) {
       
        let query = `SELECT * from orders o 
        left join order_products op on op.order = o.id 
        left join stock s on s.warehouse = op.warehouse AND s.product = op.product 
        where o.id = ${orderId}`;
        let databaseData = await this._database.raw(query);
        let orderProducts;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            orderProducts = this.mariaDbToJSON(databaseData);
        } else {
            orderProducts = databaseData.rows;
        }
        let sufficientStock = true;
        for(let i = 0 ; i<orderProducts.length; i++){
            if(orderProducts[i].available_quantity < orderProducts[i].quantity){
                sufficientStock = false;
                break;
            }
        }
      //  ////console.log(databaseData)
        return sufficientStock;
    }

    async getWarehouseProductCalculationType(product, warehouse) {
        let query = `SELECT wp.product_calculation_type , w.product_calculation_type as warehouse_calculation_type from warehouse_products wp left join warehouse w on w.id = wp.warehouse where wp.product = ${product} AND wp.warehouse = ${warehouse}`;
        let databaseData = await this._database.raw(query);
        let warehouseProduct;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            warehouseProduct = this.mariaDbToJSON(databaseData);
        } else {
            warehouseProduct = databaseData.rows;
        }
        let calculationType = Constants.defaultCalculationType;
        if(warehouseProduct.length > 0){
            // variacija
            if(warehouseProduct[0].product_calculation_type > 0){
                calculationType = warehouseProduct[0].product_calculation_type;
            }
            // parenta reiki iterpti cia 

            // warehouse nustatymas
            else if(warehouseProduct[0].warehouse_calculation_type > 0){
                calculationType = warehouseProduct[0].warehouse_calculation_type;
            }
        }

        return calculationType;
    }

    async getOrderProductSufficiency(product,warehouse,quantity) {
        let query =  `select s.* from stock s where s.warehouse = ${warehouse} AND s.product = ${product};`;
        let databaseData = await this._database.raw(query);
        let stockData;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            stockData = this.mariaDbToJSON(databaseData);
        } else {
            stockData = databaseData.rows;
        };
        let sufficiencyFalg = 0;
      
        if(stockData.length > 0){
            if(stockData[0].available_quantity >= quantity){
                sufficiencyFalg = 1;
            }
            else if(stockData[0].available_quantity > 0 && stockData[0].available_quantity < quantity){
                sufficiencyFalg = 2;
            }
        };
        return sufficiencyFalg;

    }

    async getProductCalculationType(product, warehouse) {
     //  
        let query = `SELECT product_calculation_type FROM warehouse_products WHERE product = ${product} AND warehouse = ${warehouse}`;
        let databaseData = await this._database.raw(query);
        let productCalculationType = 1;
        ////console.log(databaseData)
        if (databaseData.rows == null || databaseData.rows == undefined ) {
           let data = this.mariaDbToJSON(databaseData);
                if(data.length > 0){
              productCalculationType = data[0].productCalculationType;
                }
        }
        else {
            if(databaseData.rows.length > 0){
            productCalculationType = databaseData.rows[0].productCalculationType;
            }
        }
        
        if(productCalculationType == null || productCalculationType == undefined){
            productCalculationType = 1;
        }
        return productCalculationType;
    }
    async getArrivingProducts(warehouseHierarchy) {
    
        let query = `SELECT product, warehouse, SUM(arriving_quantity) as arriving_quantity
    FROM (
      (SELECT 
      pp.quantity as arriving_quantity,
      sp.product as product,
      p.warehouse as warehouse
      from purchase p
      inner join purchase_products pp on pp.purchase = p.id 
      inner join supplier_products sp on sp.id = pp.product
      where p.warehouse in (${warehouseHierarchy}) and p.status  = 1)
      UNION 
      (select stp.transfer_quantity as arriving_quantity,
      wp.product as product,
      st.warehouse_receiving as warehouse from
      stock_transfer st 
      inner join stock_transfer_products stp on stp.stock_transfer = st.id
      inner join  warehouse_products wp on wp.id = stp.product
      where st.status = 1 and st.warehouse_receiving in (${warehouseHierarchy})
      )
    ) as sub
    group by product, warehouse;`;
        let databaseData = await this._database.raw(query);
        let arrivingProducts;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            arrivingProducts = this.mariaDbToJSON(databaseData);
        }
        else {
            arrivingProducts = databaseData.rows;
        }
        // create map for arriving products key = warehouse_id+product_id
        let arrivingProductsMap = new Map();
        arrivingProducts.forEach((element) => {
            arrivingProductsMap.set(element.warehouse + "_" + element.product, element);
        });
        return arrivingProductsMap;
    }
    async getDueDateOrders() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - 1);
        now.setSeconds(59);
        now.setMilliseconds(0);
        let currentDate = now;
        let currentDatePlusMinute = new Date(currentDate.getTime() + 1 * 60000);
        // //////console.log("Times");
        // //////console.log(currentDate.toISOString());
        // //////console.log(currentDatePlusMinute.toISOString());
        let { ItemsService } = this._context.services;
        let schema = await this._context.getSchema();
        let warehousePurchaseTimeTableService = new ItemsService("warehouse_purchase_time_table", { schema });
        let orderData = await warehousePurchaseTimeTableService.readByQuery({
            filter: {
                order_date: {
                    _between: [
                        currentDate.toISOString(),
                        currentDatePlusMinute.toISOString(),
                    ],
                },
            },
        });
        return orderData;
    }
    async getAnalyzedPeriods(warehouseId) {
    
        let databaseData = await this._database.raw(` SELECT DISTINCT analyzed_period
      FROM warehouse_products where warehouse = ${warehouseId}
  `);
        if (databaseData.rows == null || databaseData.rows == undefined) {
            databaseData = this.mariaDbToJSON(databaseData);
        }
        else {
            databaseData = databaseData.rows;
        }
        return databaseData;
    }
    async getBatchSalesData(warehouseSrc, warehouseDst, period) {
        period =
            period == null ? process.env.TRANSFER_CALCULATION_TIMESPAN : period;
       
        let data = this._database.raw(`SELECT    
      p.product_id,
      sum(op.quantity) as sales
  FROM stock src
  INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = 1)
  INNER JOIN stock dst on src.product = dst.product
  INNER JOIN product p ON (dst.product = p.product_id)
  Left join warehouse_products pr on pr.product = p.parent_product and pr.warehouse = 1
  inner join order_products op on op.product = p.product_id and op.warehouse = 1
  inner join orders o ON o.id = op.order 
  WHERE src.warehouse = ${warehouseSrc} AND dst.warehouse = ${warehouseDst} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
  AND ((wdst.analyzed_period = ${period} AND   wdst.product_calculation_type =1 AND (wdst.use_default_value = 0 OR p.parent_product is null) ) 
  OR ( pr.analyzed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0 AND p.parent_product is not null))
  AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.use_default_value =1 and pr.product_calculation_type = 5))
  AND o.date_time >= NOW() - INTERVAL ${period} DAY
  GROUP BY p.product_id;`);
        if (data.rows == null || data.rows == undefined) {
            data = this.mariaDbToJSON(data);
        }
        else {
            data = data.rows;
        }
        return data;
    }
    async getBatchDaysInStockData(warehouseSrc, warehouseDst, period) {
       
        let data = this._database.raw(`SELECT    
      p.product_id,
      count(sh.id) as days_in_stock
  FROM stock src
  INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = 1)
  INNER JOIN stock dst on src.product = dst.product
  INNER JOIN product p ON (dst.product = p.product_id)
  Left join warehouse_products pr on pr.product = p.parent_product and pr.warehouse = 1
  inner join stock_history sh on sh.product = p.product_id and sh.warehouse = wdst.warehouse 
  WHERE src.warehouse =  ${warehouseSrc} AND dst.warehouse = ${warehouseDst} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
  AND ((wdst.analyzed_period =  ${period} AND   wdst.product_calculation_type =1 AND (wdst.use_default_value = 0 OR p.parent_product is null) ) 
  OR ( pr.analyzed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0 AND p.parent_product is not null))
  AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.use_default_value =1 and pr.product_calculation_type = 5))
  AND sh.date >= NOW() - INTERVAL  ${period} DAY
  GROUP BY p.product_id;`);
        if (data.rows == null || data.rows == undefined) {
            if (data.rows == null || data.rows == undefined) {
                data = this.mariaDbToJSON(data);
            }
            else {
                data = data.rows;
            }
            return data;
        }
    }
    async getWarehouseProducts(warehouseSource, warehouseTarget, warehouseHierarchy, period, nested, usingEnv) {
        let envValues = await this.getEnvValues();
        let usedString = "";
        period =
            period == null
                ? Number(envValues.transfer_calculations_timespan)
                : period;
        let dynamicPeriod;
        if (usingEnv == true) {
            dynamicPeriod = `is null`;
        }
        else {
            dynamicPeriod = `= ${period}`;
        }
        let nonAutomaticCalculationClause = ` AND (((  wdst.product_calculation_type IN (${warehouseHierarchy})` + (envValues.transfer_default_calculation_type > 1 ? ` OR wdst.product_calculation_type IS NULL` : ``) + ` )AND (/*wdst.use_default_value = 0 OR */ p.parent_product is null ) ) 
    OR ( pr.product_calculation_type IN (${warehouseHierarchy}) AND wdst.product_calculation_type = 0 AND p.parent_product is not null)) -- nonautomatic setting 
    `; // -- leistyi be sales history ir stock history  "Paima visus ne automatinius produktus ne pirmo tipo" -- NESTED FALSE
        let mainWhereClause = ` AND ((wdst.analyzed_period  ${dynamicPeriod} AND   wdst.product_calculation_type =1 AND (wdst.use_default_value = 0 OR p.parent_product is null) ) 
      OR ( pr.analyzed_period  ${dynamicPeriod} AND (pr.product_calculation_type = 1` + (envValues.transfer_default_calculation_type == 1 ? ` OR pr.product_calculation_type IS NULL` : ``) + ` )AND wdst.product_calculation_type = 0 AND p.parent_product is not null))`; // sitas paima visus automatinisu su savo setingais NESTED TRUE
        let envSettingsClause = `AND ((( wdst.product_calculation_type = 1` + (envValues.transfer_default_calculation_type == 1 ? ` OR wdst.product_calculation_type IS NULL` : ``) + ` )AND wdst.product_calculation_type = 0 AND p.parent_product is null  ) 
      OR (wdst.product_calculation_type = 0 AND p.parent_product is not null AND (pr.product_calculation_type = 0 AND (pr.product_calculation_type = 1 ` + (envValues.transfer_default_calculation_type == 1 ? ` OR pr.product_calculation_type IS NULL` : ``) + `)) -- env settings
      `; // jei env setting calcultation type = 1
        if (nested == true) {
            if (period == null) {
                usedString = envSettingsClause;
                //  ////console.log("envSettingsClause\n\n")
            }
            else {
                usedString = mainWhereClause;
                // ////console.log("mainWhereClause\n\n")
            }
        }
        else {
            usedString = nonAutomaticCalculationClause;
            // ////console.log("nonAutomaticCalculationClause\n\n")
        }
        period =
            period == null
                ? Number(envValues.transfer_calculations_timespan)
                : period;
      
        let query;
        let outerQueryDynamicPart = nested == false
            ? ``
            : `,
        IFNULL(days_in_stock.days_in_stock,0) as days_in_stock,
        IFNULL(sales_data.sales , 0) as sales`;
        let outerQuerry = `SELECT
    big_data.use_default_value,
    big_data.warehouse,
    big_data.product_id,
    big_data.ordered AS ordered_quantity,
    big_data.reserved AS reserved_quantity,
    big_data.available AS available_quantity,
    big_data.onhand AS onhand_quantity,
    big_data.parent_type,
    big_data.divisible,
    big_data.wh_moq,
    big_data.parent_analized_period,
    big_data.parent_order_count,
    big_data.parent_buffer,
    big_data.parent_wh_moq,
    big_data.kmeans_centroid
    ${outerQueryDynamicPart}

     FROM (
      
      SELECT    
          wdst.use_default_value,
          wdst.warehouse,
          p.product_id,
          p.name,
          p.parent_product,
          p.divisible,
          -- p.is_parent, TODO perkelti is parent i main product
          IFNULL(dst.ordered_quantity,0) AS ordered,
          IFNULL(dst.reserved_quantity,0) AS reserved,
          IFNULL(dst.available_quantity,0) AS available,
          IFNULL(dst.onhand_quantity,0) AS onhand,
          wdst.moq AS wh_moq,
          wdst.product_calculation_type,
          wdst.buffer,
          wdst.analyzed_period,
          wdst.order_count_trough_ap,
          wdst.transfer_only_full_package,
          IFNULL(wdst.kmeans_centroid,0) as kmeans_centroid,
          IFNULL(pr.product_calculation_type,1) AS parent_type,
          pr.analyzed_period AS parent_analized_period,
          pr.order_count_trough_ap AS parent_order_count,
          pr.buffer AS parent_buffer,
          pr.moq AS parent_wh_moq,
          pr.product

            
              FROM stock src
              INNER JOIN warehouse_products hdst ON (src.product = hdst.product  AND hdst.warehouse = ${warehouseTarget} AND src.warehouse = ${warehouseSource}) -- helper filter , filtering products that only exists in MAIN parent warehouse
              INNER JOIN warehouse_products wdst ON (hdst.product = wdst.product  AND wdst.warehouse IN (${warehouseHierarchy}))
              INNER JOIN product p ON (wdst.product = p.product_id) -- main product id 
              LEFT JOIN stock dst ON wdst.product = dst.product AND dst.warehouse = wdst.warehouse-- destination stock
            -- LEFT JOIN product_price pp ON pp.supplier_products = sp.id -- product price ( price , moq delivery time - inside supplier_product )
              LEFT JOIN product cp on p.product_id = cp.parent_product -- child product 

              LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse = wdst.warehouse -- parent wh product
      WHERE src.warehouse = ${warehouseSource} AND dst.warehouse = ${warehouseTarget} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
      ${usedString}
      AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.use_default_value =1 and pr.product_calculation_type = 5))
      GROUP BY p.product_id
      
      ) big_data`;
        let salesQuerry = `LEFT JOIN (
        
      SELECT    
        p.product_id,
        sum(op.quantity) as sales
    FROM stock src
    INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse =  ${warehouseTarget})
    INNER JOIN stock dst on src.product = dst.product
    INNER JOIN product p ON (dst.product = p.product_id)
    Left join warehouse_products pr on pr.product = p.parent_product and pr.warehouse =  ${warehouseTarget}
    inner join order_products op on op.product = p.product_id and op.warehouse =  ${warehouseTarget}
    inner join orders o ON o.id = op.order 
    WHERE src.warehouse = ${warehouseSource} AND dst.warehouse =  ${warehouseTarget} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
    ${usedString}
    AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.use_default_value =1 and pr.product_calculation_type = 5))
    AND o.date_time >= NOW() - INTERVAL ${period} DAY
    GROUP BY p.product_id
    
    ) sales_data on sales_data.product_id = days_in_stock.product_id`;
        let daysInStockQuerry = `LEFT JOIN (
        
      SELECT    
        p.product_id,
        count(sh.id) as days_in_stock
    FROM stock src
    INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse =  ${warehouseTarget})
    INNER JOIN stock dst on src.product = dst.product
    INNER JOIN product p ON (dst.product = p.product_id)
    Left join warehouse_products pr on pr.product = p.parent_product and pr.warehouse =  ${warehouseTarget}
    inner join stock_history sh on sh.product = p.product_id and sh.warehouse = wdst.warehouse 
    WHERE src.warehouse = ${warehouseSource} AND dst.warehouse =  ${warehouseTarget} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
    ${usedString}
    AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.use_default_value =1 and pr.product_calculation_type = 5))
    AND sh.date >= NOW() - INTERVAL ${period} DAY
    GROUP BY p.product_id
    
    ) days_in_stock on days_in_stock.product_id = big_data.product_id`;
        if (nested == true) {
            query = `${outerQuerry} ${daysInStockQuerry} ${salesQuerry};`;
        }
        else {
            query = outerQuerry;
        }
        fs__default["default"].appendFileSync("Warehousequery.txt", query + "\n\n--------------------END OF QUERY-------------------\n\n");
        let databaseData = await this._database.raw(query);
        if (databaseData.rows == null || databaseData.rows == undefined) {
            databaseData = this.mariaDbToJSON(databaseData);
        }
        else {
            databaseData = databaseData.rows;
        }
        return databaseData;
    }
    async getWarehouseSales(warehouseId, startDate, endDate) {
        let schema = await this._context.getSchema();
        let { ItemsService } = this._context.services;
        let salesProductsService = new ItemsService("sales_product", { schema });
        let start = new Date(startDate);
        let end = new Date(endDate);
        // //////console.log("startDate: "+start);
        // //////console.log("endDate : "+end);
        let warehouseSales = await salesProductsService.readByQuery({
            filter: {
                _and: [
                    { order: { date_time: { _between: [start, end] } } },
                    { warehouse: { _eq: warehouseId } },
                ],
            },
        });
        return warehouseSales;
    }
    async getSalesData(products, warehouseId, startDate, currentDate) {
       
        let salesDbData = await this._database.raw(`SELECT op.product, SUM(op.quantity) as sales FROM orders o INNER JOIN order_products op ON o.id = op.order WHERE op.product IN (${products}) AND o.date_time BETWEEN '${startDate.toISOString()}' AND '${currentDate.toISOString()}' AND op.warehouse = ${warehouseId} AND NOT o.order_status = 4 GROUP BY op.product;`);
        let salesData = [];
        if (salesDbData.rows != null && salesDbData.rows != undefined) {
            salesData = salesDbData.rows;
        }
        else {
            salesData = this.mariaDbToJSON(salesDbData);
        }
        // //////console.log("getSalesData: ");
        // //////console.log(salesData);
        return salesData;
    }
    async getDaysInStockData(products, warehouseId, startDate, currentDate) {
       
        let daysInStockDbData = await this._database.raw(` SELECT sh.product,COUNT(sh.date) AS days_in_stock FROM stock_history sh WHERE sh.product IN (${products}) AND sh.date BETWEEN '${startDate.toISOString()}' AND '${currentDate.toISOString()}' AND warehouse = ${warehouseId}   GROUP BY sh.product;`);
        let daysInStockData = [];
        if (daysInStockDbData.rows != null && daysInStockDbData.rows != undefined) {
            daysInStockData = daysInStockDbData.rows;
        }
        else {
            daysInStockData = this.mariaDbToJSON(daysInStockDbData);
        }
        // //////console.log("getDaysInStockData")
        // //////console.log(daysInStockData);
        return daysInStockData;
    }
    async getCurrentStockData(products, warehouseId) {
       
        let currentStockDbData = await this._database.raw(` select p.backorder,  p.parent_product, s.product ,s.available_quantity ,s.warehouse from stock s left join product p on s.product = p.product_id where s.product in (${products}) and s.warehouse = ${warehouseId};`);
        let currentStockData = [];
        if (currentStockDbData.rows != null &&
            currentStockDbData.rows != undefined) {
            currentStockData = currentStockDbData.rows;
        }
        else {
            currentStockData = this.mariaDbToJSON(currentStockDbData);
        }
        // //////console.log("getCurrentStockData");
        // //////console.log(currentStockData);
        return currentStockData;
    }
    async getWarehousePurchaseTimeTableData(warehouseId, supplierId, currentDate) {
       
        ////////console.log(currentDate.toISOString())
        let databaseData = await this._database.raw(`SELECT * from warehouse_purchase_time_table where order_date >= '${currentDate.toISOString()}' AND warehouse = ${warehouseId} AND supplier = ${supplierId} ORDER BY order_date ASC LIMIT 2;`);
        let timeTableData = [];
        // //////console.log(databaseData)
        if (databaseData.rows == null || databaseData.rows == undefined) {
            timeTableData = this.mariaDbToJSON(databaseData);
        }
        else {
            timeTableData = databaseData.rows;
        }
        return timeTableData;
    }
    async getConfigs(supplierId, productId) {
       
        let databaseData = await this._database.raw(` select * from supplier_products sp left join attribute_config ac on ac.supplier_product = sp.id where sp.supplier =${supplierId} and sp.product = ${productId};`);
        let configs;
        if (databaseData.rows == null || databaseData.rows == undefined) {
            configs = this.mariaDbToJSON(databaseData);
        }
        else {
            configs = databaseData.rows;
        }
        ////////console.log("getConfigs")
        // //////console.log(configs)
        return configs;
    }
    async getAllProducts(supplierId) {
       
        let databaseData = await this._database.raw(`SELECT 
        sp.id,
        sp.delivery_term,
        sp.is_parent,
        p.product_id,
        p.name,
        p.parent_product,
       GROUP_CONCAT(av.id ORDER BY av.id) as attribute_values_ids,
    GROUP_CONCAT(CONCAT(a.name, ':', av.value) ORDER BY a.id) AS attribute_values,
        pp.price,
        pp.package_MOQ,
        GROUP_CONCAT( ac.id ORDER BY ac.id) as attribute_config_group,
        GROUP_CONCAT( cp.product_id ORDER BY cp.product_id ) as childs/*,
        kcd.centroids ,
        kcd.cluster_sizes ,
        kcd.cluster_min_max ,
        kcd.cluster_percentages */
    FROM
        supplier_products sp
    LEFT JOIN
        product p ON sp.product = p.product_id
    LEFT JOIN
    product cp ON p.product_id = cp.parent_product 
    LEFT JOIN
        attribute_value_product avp ON avp.product_product_id = p.product_id
    LEFT JOIN
        attribute_value av ON avp.attribute_value_id = av.id
    LEFT JOIN
        attributes a ON a.id = av.attribute
    LEFT JOIN
        product_price pp ON pp.supplier_products = sp.id
    Left Join attribute_config ac on ac.attribute_value = av.id
    -- left join kmeans_calculated_data kcd on p.product_id = kcd.product 
    WHERE
        sp.supplier = ${supplierId}
    GROUP BY
        p.product_id, sp.id, pp.price, pp.package_MOQ, pp.MOQ_delivery_time; 
    
    `);
        let products;
        //
        if (databaseData.rows == null || databaseData.rows == undefined) {
            products = this.mariaDbToJSON(databaseData);
        }
        else {
            products = databaseData.rows;
        }
        // //////console.log("\n\n\n\n\n\n")
        // //////console.log(products[0])
        fs__default["default"].writeFileSync("products.txt", "raw log products:" + JSON.stringify(products[0]));
        return products;
    }
    async getGroupedProducts(attributeValue, parentProduct, supplierId) {
       
        let databaseData = await this._database.raw(` select sp.id,sp.delivery_term,sp.supplier,sp.is_parent,sp.product,p.name,p.attributes,p.parent_product,avp.attribute_value_id,avp.product_product_id from supplier_products sp left join product p on p.product_id = sp.product 
        left join attribute_value_product avp on avp.product_product_id = p.product_id where sp.supplier = ${supplierId} and avp.attribute_value_id = ${attributeValue} and p.parent_product =${parentProduct};`);
        let products;
        //
        if (databaseData.rows == null || databaseData.rows == undefined) {
            products = this.mariaDbToJSON(databaseData);
        }
        else {
            products = databaseData.rows;
        }
        // //////console.log("\n\n\n\n\n\n")
        ////////console.log(products[0])
        fs__default["default"].writeFileSync("products.txt", "raw log products:" + JSON.stringify(products[0]));
        return products;
    }
    async getProductsForSupplyCalculation(supplier, warehouse, warehouses, period, nested, usingEnv) {
        let envValues = await this.getEnvValues();
       
        let query;
        let usedString = ``;
        period =
            period == null
                ? Number(envValues.transfer_calculations_timespan)
                : period;
        let dynamicPeriod;
        if (usingEnv == true) {
            dynamicPeriod = `is null`;
        }
        else {
            dynamicPeriod = `= ${period}`;
        }
        let nonAutomaticCalculationClause = ` AND (((  wdst.product_calculation_type IN (2,3,4)` + (envValues.transfer_default_calculation_type > 1 ? ` OR wdst.product_calculation_type IS NULL` : ``) + ` )AND (/*wdst.use_default_value = 0 OR */ p.parent_product is null ) ) 
       OR ( pr.product_calculation_type IN (2,3,4) AND wdst.product_calculation_type = 0 AND p.parent_product is not null)) -- nonautomatic setting 
       `; // -- leistyi be sales history ir stock history  "Paima visus ne automatinius produktus ne pirmo tipo" -- NESTED FALSE
        let mainWhereClause = ` AND ((wdst.analyzed_period  ${dynamicPeriod} AND   wdst.product_calculation_type = 1 AND (wdst.product_calculation_type != 0 OR p.parent_product is null) ) 
      OR ( pr.analyzed_period  ${dynamicPeriod} AND (pr.product_calculation_type = 1` + (envValues.transfer_default_calculation_type == 1 ? ` OR pr.product_calculation_type IS NULL` : ``) + ` )AND wdst.product_calculation_type = 0 AND p.parent_product is not null))`; // sitas paima visus automatinisu su savo setingais NESTED TRUE
        let envSettingsClause = `AND ((( wdst.product_calculation_type = 1` + (envValues.transfer_default_calculation_type == 1 ? ` OR wdst.product_calculation_type IS NULL` : ``) + ` )AND wdst.product_calculation_type = 0 AND p.parent_product is null  ) 
      OR (wdst.product_calculation_type = 0 AND p.parent_product is not null AND (pr.product_calculation_type = 0 AND (pr.product_calculation_type = 1 ` + (envValues.transfer_default_calculation_type == 1 ? ` OR pr.product_calculation_type IS NULL` : ``) + `)) -- env settings
      `; // jei env setting calcultation type = 1
        if (nested == true) {
            if (period == null) {
                usedString = envSettingsClause;
            }
            else {
                usedString = mainWhereClause;
            }
        }
        else {
            usedString = nonAutomaticCalculationClause;
        }
        /*  AND (
            (wdst.analyzed_period = ${period} AND wdst.product_calculation_type = 1 AND (wdst.use_default_value = 0 OR p.parent_product IS NULL))
            OR (pr.analyzed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0 AND p.parent_product IS NOT NULL)
        )
        AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.product_calculation_type = 0 AND pr.product_calculation_type = 5))*/
        let outerQueryDynamicPart = nested == false
            ? ``
            : `,
        IFNULL(days_in_stock.days_in_stock,0) as days_in_stock,
        IFNULL(sales_data.sales , 0) as sales`;
        // ,
        //sales_data.orders_count
        //used string assigment here ( logic by nested / not nested)
        let outerQuerry = `SELECT
    big_data.use_default_value,
    big_data.warehouse,
    big_data.attribute_config_data,
      big_data.product_id,
      big_data.supplier_product_id,
      big_data.name,
      big_data.parent_product,
      big_data.divisible,
      big_data.delivery_term,
      big_data.is_parent,
      big_data.ordered AS ordered_quantity,
      big_data.reserved AS reserved_quantity,
      big_data.available AS available_quantity,
      big_data.onhand AS onhand_quantity,
      IFNULL(big_data.moq,0) as wh_moq,
      big_data.product_calculation_type,
      big_data.buffer,
      big_data.analyzed_period,
      big_data.order_count_trough_ap,
      big_data.transfer_only_full_package,
      big_data.attribute_value_id,
      big_data.parent_type,
      big_data.parent_analized_period,
      big_data.parent_order_count,
      big_data.parent_buffer,
      big_data.parent_moq as parent_wh_moq,
     -- big_data.attribute_values,
     -- big_data.attribute_values_ids,
       big_data.attribute_config_group,
      big_data.childs,
       big_data.price,
       big_data.package_MOQ as moq,
       big_data.supplier_parent_moq,
       big_data.attribute_config_moq,
       big_data.attribute_config_delivery_time,
       big_data.kmeans_centroid
    ${outerQueryDynamicPart}
FROM (
  SELECT
  wdst.use_default_value,
  wdst.warehouse,
  p.product_id,
  p.name,
  p.parent_product,
  p.divisible,
  sp.id as supplier_product_id ,
  sp.delivery_term,
  sp.is_parent,
  pp.price,
  pp.package_MOQ,
  GROUP_CONCAT( ac.id ORDER BY ac.id) as attribute_config_group,
  GROUP_CONCAT( cp.product_id ORDER BY cp.product_id ) as childs,
  CONCAT ( '[' ,GROUP_CONCAT(DISTINCT  CONCAT('{"attribute_config_id": ', ac.id,' , "moq" :', ac.moq ,', "delivery_time":', ac.delivery_time,'}' ) ORDER BY ac.moq DESC), ']') as attribute_config_data,
  IFNULL(dst.ordered_quantity,0) AS ordered,
  IFNULL(dst.reserved_quantity,0) AS reserved,
  IFNULL(dst.available_quantity,0) AS available,
  IFNULL(dst.onhand_quantity,0) AS onhand,
  wdst.moq AS moq,
  wdst.product_calculation_type,
  wdst.buffer,
  wdst.analyzed_period,
  wdst.order_count_trough_ap,
  wdst.transfer_only_full_package,
  IFNULL(wdst.kmeans_centroid,0) as kmeans_centroid,
  avp.attribute_value_id,
  IFNULL(pr.product_calculation_type,${envValues.transfer_default_calculation_type}) AS parent_type,
  pr.analyzed_period AS parent_analized_period,
  pr.order_count_trough_ap AS parent_order_count,
  pr.buffer AS parent_buffer,
  pr.moq AS parent_moq,
  pr.product,
  -- GROUP_CONCAT(CONCAT(a.name, ':', av.value) ORDER BY a.id) AS attribute_values,
  -- GROUP_CONCAT(av.id ORDER BY av.id) AS attribute_values_ids,
  ppp.package_MOQ as supplier_parent_moq,
  ac.moq as attribute_config_moq,
  ac.delivery_time as attribute_config_delivery_time
    
  FROM
  supplier_products sp
      INNER JOIN warehouse_products hdst ON (sp.product = hdst.product  AND hdst.warehouse = ${warehouse}) -- helper filter , filtering products that only exists in MAIN parent warehouse
      INNER JOIN warehouse_products wdst ON (hdst.product = wdst.product  AND wdst.warehouse IN (${warehouses}))
      INNER JOIN product p ON (wdst.product = p.product_id) -- main product id 
      LEFT JOIN stock dst ON wdst.product = dst.product AND dst.warehouse = wdst.warehouse-- destination stock
      LEFT JOIN product_price pp ON pp.supplier_products = sp.id -- product price ( price , moq delivery time - inside supplier_product )
      LEFT JOIN product cp on p.product_id = cp.parent_product -- child product 
      LEFT JOIN attribute_value_product avp ON avp.product_product_id = p.product_id -- joining 
      LEFT JOIN attribute_value av ON av.id = avp.attribute_value_id
      LEFT JOIN attributes a ON a.id = av.attribute
      LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse = wdst.warehouse -- parent wh product
      LEFT JOIN supplier_products psp on psp.product = p.parent_product and psp.supplier = sp.supplier -- parent supplier product join
      LEFT JOIN attribute_config ac on ac.attribute_value = av.id AND ac.supplier_product = psp.id
      LEFT JOIN product_price ppp  on psp.id = ppp.supplier_products 
  WHERE
      sp.supplier = ${supplier}
        ${usedString}
    GROUP BY
        p.product_id , sp.id  , pp.price, pp.package_MOQ, pp.MOQ_delivery_time, wdst.warehouse
) big_data`;
        let daysInStockQuerry = `LEFT JOIN (
  SELECT
  sh.warehouse ,
  p.product_id,
  COUNT(sh.id) AS days_in_stock
  FROM
  stock src
  INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = ${warehouse})
  -- INNER JOIN stock dst ON src.product = dst.product
  INNER JOIN product p ON (src.product = p.product_id)
  LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse = ${warehouse}
  INNER JOIN stock_history sh ON sh.product = p.product_id
  -- select parent warehouse product days in stock trough all child warehouses included
  WHERE src.warehouse =  ${warehouse} AND sh.warehouse IN (${warehouses})
        ${usedString}
        AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.product_calculation_type = 0 and pr.product_calculation_type = 5))
        AND sh.date >= NOW() - INTERVAL ${period} DAY
    GROUP BY
        p.product_id,sh.warehouse
  ) days_in_stock ON days_in_stock.product_id = big_data.product_id  AND days_in_stock.warehouse = big_data.warehouse`;
        let salesQuerry = ` LEFT JOIN (
SELECT
p.product_id,
SUM(op.quantity) AS sales,
op.warehouse
FROM
warehouse_products wdst
INNER JOIN product p ON (wdst.product = p.product_id)
LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse =  ${warehouse}
INNER JOIN order_products op ON op.product = p.product_id 
INNER JOIN orders o ON o.id = op.order
-- select parent warehouse product sales trough all child warehouses included
WHERE wdst.warehouse =  ${warehouse} AND op.warehouse IN (${warehouses}) 
      ${usedString}
      AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.product_calculation_type = 0 AND pr.product_calculation_type = 5))
      AND o.date_time >= NOW() - INTERVAL ${period} DAY
  GROUP BY
      p.product_id, op.warehouse      
) sales_data ON sales_data.product_id = big_data.product_id AND sales_data.warehouse = big_data.warehouse`;
        // ,
        //COUNT(o.id) as orders_count
        if (nested == true) {
            query = `${outerQuerry} ${daysInStockQuerry} ${salesQuerry};`;
        }
        else {
            query = outerQuerry;
        }
        fs__default["default"].appendFileSync("query.txt", query + "\n\n--------------------END OF QUERY-------------------\n\n");
        let databaseData = await this._database.raw(query);
        if (databaseData.rows == null || databaseData.rows == undefined) {
            databaseData = this.mariaDbToJSON(databaseData);
        }
        else {
            databaseData = databaseData.rows;
        }
        return databaseData;
    }
    async getWarehouseHierarchy(warehouseId) {
       
        let query = `select DISTINCT parent_warehouse , child_warehouse from warehouse_relation wr where parent_warehouse is not null;`;
        let databaseData = await this._database.raw(query);
        if (databaseData.rows == null || databaseData.rows == undefined) {
            databaseData = this.mariaDbToJSON(databaseData);
        }
        else {
            databaseData = databaseData.rows;
        }
        let topHierarchy = new Map();
        let allWarehouses = [];
        function buildHierarchy(databaseData, parentId) {
            let hierarchy = new Map();
            let children = databaseData.filter(item => item.parent_warehouse == parentId);
            // recursive call for children hierarchy
            children.forEach(child => {
                allWarehouses.push(child.child_warehouse);
                hierarchy.set(Number(child.child_warehouse), buildHierarchy(databaseData, Number(child.child_warehouse)));
            });
            return hierarchy;
        }
        topHierarchy.set(Number(warehouseId), buildHierarchy(databaseData, Number(warehouseId)));
        return { hierarchy: topHierarchy, warehouses: allWarehouses };
    }
    
    async getWarehouseProductsCluster(warehouseId,period,startDate){
        const database = this._context.database;
        ////console.log("data retrieval function started")
        let startTime = process.hrtime();

        let dateQuery = "";
        let year = startDate.getFullYear();
        let month = ('0' + (startDate.getMonth() + 1)).slice(-2);
        let day =  ('0' + startDate.getDate()).slice(-2);
        let formattedDate = `${year}-${month}-${day}`;
        if(startDate != null){
            dateQuery = `and o.date_time > ${formattedDate} `;
        }

        let periodQuery = "";
        if(period != null){
            periodQuery = `o.date_time >= NOW() - INTERVAL ${period} DAY and`;
        }
        
        let query = `SELECT 
        op.product,
        GROUP_CONCAT(op.quantity SEPARATOR ',') AS quantities
    FROM 
        order_products op 
    INNER JOIN 
        orders o ON op.order = o.id 
    INNER JOIN
        (SELECT DISTINCT op.product ,op.warehouse 
            FROM 
                order_products op 
            INNER JOIN 
                orders o ON o.id = op.order 
            WHERE 
                op.warehouse = ${warehouseId}
                AND o.date_time > '${formattedDate}') sales_data on sales_data.product =  op.product 
    WHERE 
        o.date_time >= NOW() - INTERVAL ${period} DAY 
        and op.warehouse = ${warehouseId}
    GROUP BY 
        op.product;
       `

        // let orderedProductQuery =`select distinct op.product from warehouse_products wp 
        // inner join order_products op on op.warehouse = wp.warehouse  and wp.product = op.product 
        // inner join orders o on o.id = op.order 
        // where wp.warehouse = ${warehouseId} 
        // ${dateQuery}`

        // let quantityQuery = `select op.product , GROUP_CONCAT(op.quantity SEPARATOR ',') as quantities from 
        // order_products op 
        // inner join orders o on op.order = o.id 
        // where ${periodQuery} op.product in (${orderedProductQuery}) GROUP BY op.product`;
        
        
        //fs.appendFileSync("kmeansDataQuery.txt", quantityQuery+"\n\n--------------------END OF QUERY-------------------\n\n");
        let databaseData = await this._database.raw(query);
        let data;
        if(databaseData.rows ==null || databaseData.rows == undefined){
            data = this.mariaDbToJSON(databaseData);
        }
        else{
            data = databaseData.rows;
        }
        let endTime = process.hrtime(startTime);
        let executionTimeInSec = endTime[0] + endTime[1] / 1e9;
        ////console.log("data retrieval function ended , it took "+executionTimeInSec+" ms to execute");
       
        return data;



    }

    async getStockId(warehouseId,productId) {
     
        let data = await this._database.raw('SELECT * FROM stock where warehouse = '+warehouseId+' and product = '+productId+';');
        let stockId = this.scrubData(data);
        return stockId;
    }


    async getCurrentStock(){
      
        let data = await this._database.raw('SELECT * FROM stock where available_quantity > 0;');
        let products;
        if(data.rows ==null || data.rows == undefined){
             products = this.mariaDbToJSON(data);
        }
        else{
             products = data.rows;
        }
       
         return products;
    }

    async getAllWarehouseProductsCluster(warehouseId){
       const database = this._context.database;
       let data = await this._database.raw('SELECT s.product FROM stock s left join order_products op on op.product = s.product left join orders o on o.id = op.`order` WHERE s.warehouse = '+warehouseId+' and o.date_time >= CURDATE() - INTERVAL '+process.env.KMEANS_DAYS_FOR_PRODUCT_RETRIEVAL+' DAY;');
       let products;
       if(data.rows ==null || data.rows == undefined){
            products = this.mariaDbToJSON(data);
       }
       else{
            products = data.rows;
       }
      
        return products;
    }

    async getSalesProductsCluster(productId){
     
        const database = this._context.database;
        let data = await this._database.raw('SELECT op.quantity FROM order_products op left join orders o on o.id = op.`order` WHERE product = '+productId+' and o.date_time >= CURDATE() - INTERVAL '+process.env.KMEANS_DAYS_FOR_STATISTIC_CALCULATION+' DAY;');
        let products;
        if(data.rows ==null || data.rows == undefined){
             products = this.mariaDbToJSON(data);
        }
        else{
             products = data.rows;
        }
       
         return products;
    }

    async getOrderProductsCluster(productId,timespan){
        const {ItemsService} = this._context.services;
        let schema = await this._context.getSchema();
        let orderService = new ItemsService("orders",{schema});
        let salesProductService = new ItemsService("order_products",{schema});
        let currentDate = new Date();
        currentDate.setHours(currentDate.getHours()+2);
        let pastDate = new Date();
        ////console.log(currentDate);
        
        pastDate.setMonth(pastDate.getMonth()-timespan);
        
        ////console.log(pastDate);
        let data = await salesProductService.readByQuery({filter:{_and:[
            {product:{_eq:productId}},
            {order:{date_time:{_between:[pastDate,currentDate]}}}
        ]}});
        return data;
    }
    async getOrderWarehouseProductsCluster(productId,warehouseId,timespan){
        const {ItemsService} = this._context.services;
        let schema = await this._context.getSchema();
        let orderService = new ItemsService("orders",{schema});
        let salesProductService = new ItemsService("order_products",{schema});
        let currentDate = new Date();
        currentDate.setHours(currentDate.getHours()+2);
        let pastDate = new Date();
        ////console.log(currentDate);
        
        pastDate.setMonth(pastDate.getMonth()-timespan);
        
        ////console.log(pastDate);
        let data = await salesProductService.readByQuery({filter:{_and:[
            {product:{_eq:productId}},
            {warehouse:{_eq:warehouseId}},
            {order:{date_time:{_between:[pastDate,currentDate]}}}
        ]}});
        return data;
    }

    async getLastTimestamp(product,warehouse,database){
       
        let data = await this._database.raw('select last_timestamp from product_timestamps where product = '+product+' and warehouse = '+warehouse+' order by id desc;');
        let timestamp;
        if(data.rows ==null || data.rows == undefined){
            timestamp = this.mariaDbToJSON(data);
        }
        else{
            timestamp = data.rows;
        }
        return timestamp[0];
    }


    async isSoldOut(product,warehouse,database){
      //  const database = this._context.database;
        let dbData = await this._database.raw('select available_quantity from stock where product = '+product+' and warehouse = '+warehouse+';');
        let data;
        if(dbData.rows ==null || data.rows == undefined){
            data = this.mariaDbToJSON(data);
        }
        else{
            data = data.rows;
        }
        if(data.length > 0){
            let soldOut = data[0].available_quantity <=0 ? true : false;
            return soldOut;
        }
        else{
            return true;
        }
    }

    async getOrderCheckData(warehouseId){
       
        let orderData;
        let query =`select o.id as order_id , op.product as product_id , ifnull (s.available_quantity , -1*op.quantity) as available_quantity, ifnull(sc.reserved_quantity ,0)  as reserved_quantity , op.quantity , o.date_time as order_date , osh.date_created processing_date 
                    from order_products op 
                    inner join orders o on o.id = op.order 
                    inner join order_status_history osh on (o.id = osh.order_id and osh.status_id = ${Constants.orderPreparingStatus}) -- 50
                    left join stock s on s.product = op.product and s.warehouse = ${warehouseId}
                    left join (
                            select op.product , sum(s.reserved_quantity) as reserved_quantity from sales_channel sc 
                            inner join orders o on o.sales_channel = sc.id 
                            inner join order_status os on os.id = o.order_status 
                            inner join order_products op on op.order = o.id 
                            inner join stock s on s.product = op.product 
                            where sc.default_warehouse = ${warehouseId} and sc.ship_reserved = 1 and s.reserved_quantity > 0 and os.parent_status = ${Constants.receivedStatus} group by op.product 
                    ) as sc on sc.product = op.product 
                    where o.order_status in (${Constants.productsOrderedStatus},${Constants.missingPorductsStatus})
                    and op.warehouse = ${warehouseId}
                    order by osh.date_created asc , o.id;`;
        let databaseData = await this._database.raw(query);
        if (databaseData.rows == null || databaseData.rows == undefined) {
                  orderData = this.mariaDbToJSON(databaseData);
                } else {
                  orderData = databaseData.rows;
                }
               // ////console.log(orderData);
                return orderData;
      }

      async getReplenishment(replenishmentId) {
        let databaseData = await this._database.raw(
          `SELECT * from stock_replenishment where id = ${replenishmentId}`
        );
        let replenishmentData;
        if (databaseData.rows == null || databaseData.rows == undefined) {
          replenishmentData = this.mariaDbToJSON(databaseData);
        } else {
          replenishmentData = databaseData.rows;
        }
        return replenishmentData;
      }



    scrubData(data){
        let scrubedData
        if(data.rows ==null || data.rows == undefined){
            scrubedData = this.mariaDbToJSON(data);
        }
        else{
            scrubedData = data.rows;
        }
        return scrubedData;
    }
    mariaDbToJSON(data){
        let dataArray = [];
        // ////console.log("mariaDbToJSON")
        // ////console.log(data)
        if(data != undefined){
            let rows = data[0];
            for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            let jsonString = JSON.stringify(row);
            let jsonObject = JSON.parse(jsonString);
            dataArray.push(jsonObject);
            }
        }
        return dataArray;
      }

   
} export default DataProvider;