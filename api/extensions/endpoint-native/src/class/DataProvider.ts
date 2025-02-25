//import fs from "fs";
import Log from "./Log";
import Constants from "../const/Constants";

class DataProvider {
  private _context: any;

  constructor(context: any) {
    this._context = context;
  }

  async getGroups(): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT name as grp_name, id from groups;`);
    let groups;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      groups = this.mariaDbToJSON(databaseData);
    } else {
      groups = databaseData.rows;
    }
    return groups;
  }

  async getAddressByCustomer(customerId: number): Promise<any> {
    let database = this._context.database;
    console.log(customerId)
    let databaseData = await database.raw(`SELECT id as add_id, address, city  from address where customer = ${customerId};`);
    return this.scrubData(databaseData)
  }

  async getCustomerByLoyaltyCard(loyaltyCard: string): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`
      SELECT cust.id as cust_id, cust.first_name, cust.last_name ,CONCAT(cust.first_name, ' ', cust.last_name) as full_name
      FROM cards c
      left join customers cust on c.customer = cust.id
      WHERE c.number = '${loyaltyCard}'
      LIMIT 1;
    `);
    let customer;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      customer = this.mariaDbToJSON(databaseData);
    } else {
      customer = databaseData.rows;
    }
    return customer.length > 0 ? customer[0] : null;
  }


  async getCustomers(search:string){
    let database = this._context.database;
    let databaseData = await database.raw(`
  SELECT c.id as cust_id , c.first_name , c.last_name  , c.email  ,CONCAT(first_name , ' ' , last_name)as full_name ,c.phone , GROUP_CONCAT(cs.number) as cards FROM customers c 
  left join cards cs on c.id = cs.customer and cs.status = 1
  where c.first_name LIKE "%${search}%" or c.last_name LIKE "%${search}%" or cs.number LIKE "%${search}%" or c.email  LIKE "%${search}%" or c.phone  LIKE "%${search}%" group by c.id;
   `);
   console.log(databaseData);
   return this.scrubData(databaseData);
  }

  async getCustomerByName(name: string): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`
      SELECT c.id as cust_id, c.first_name, c.last_name, CONCAT(c.first_name, ' ', c.last_name) as full_name
      FROM customers c
      WHERE c.first_name LIKE '%${name}%'
      OR c.last_name LIKE '%${name}%'
      ORDER BY c.first_name ASC;
    `);
    let customers;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      customers = this.mariaDbToJSON(databaseData);
    } else {
      customers = databaseData.rows;
    }
    return customers;
  }
  async getCustomerByCardNumber(cardNumber: string): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`
      SELECT c.* 
      FROM customers c
      JOIN cards cd ON c.id = cd.customer
      WHERE cd.number = '${cardNumber}'
      LIMIT 1;
    `);
    
    return  this.scrubData(databaseData);
  }

  async getChildCustomers(parent: any, page: number = 1, limit: number = 50): Promise<any> {
    const offset = (page - 1) * limit;
    let query = `SELECT c.id as cust_id,
      c.first_name, c.last_name , CONCAT(c.first_name, ' ', c.last_name) as full_name
      FROM customers c
      WHERE c.parent_customer = ${parent}
      GROUP BY c.id
      LIMIT ${limit} OFFSET ${offset};`;
    let database = this._context.database;
    let databaseData = await database.raw(query);
    return this.scrubData(databaseData);

  }

  async getCustomersWithPagination(page: number = 1, limit: number = 50): Promise<any> {
    const offset = (page - 1) * limit;
    let query = `SELECT 
      c.id as cust_id,
      c.first_name, 
      c.last_name,
      CONCAT(c.first_name, ' ', c.last_name) as full_name,
      COUNT(*) OVER() as total_count
      FROM customers c
      WHERE c.parent_customer is null
      GROUP BY c.id
      LIMIT ${limit} OFFSET ${offset};`;
    let database = this._context.database;
    let databaseData = await database.raw(query);
    return this.scrubData(databaseData);

  }


  async getAttributes(): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT name, name as att_name, id from attributes;`);
    let attributes;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      attributes = this.mariaDbToJSON(databaseData);
    } else {
      attributes = databaseData.rows;
    }
    return attributes;
  }

  async getFeatures(): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT name, name as att_name, id from features;`);
    let features;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      features = this.mariaDbToJSON(databaseData);
    } else {
      features = databaseData.rows;
    }
    return features;
  }


  async getParentProducts(): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT product_id,name as item_name  from product where parent_product is null;`);
    let parentProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      parentProducts = this.mariaDbToJSON(databaseData);
    } else {
      parentProducts = databaseData.rows;
    }
    return parentProducts;
  }
  

  async getChildProducts(parentProduct: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT product_id,attributes from product where parent_product = ${parentProduct};`);
    let childProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      childProducts = this.mariaDbToJSON(databaseData);
    } else {
      childProducts = databaseData.rows;
    }
    return childProducts;
  }

  async getProductsForAnalyzers(warehouse: any, interval: any, forParent: boolean = false): Promise<any> {
    let database = this._context.database;
    let primaryQuery = `  SELECT 
                          op.product as product_id,
                          DATE(o.date_time) as date,
                          op.quantity,
                          IFNULL(op.stock_available,0) as stockout,
                          IFNULL(op.promo,0) as promo 
                          
                          FROM
                              order_products op 
                          LEFT JOIN
                              orders o ON o.id = op.order
                          WHERE 
                              op.warehouse = ${warehouse}
                              AND  o.date_time >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
  
    let parentQuery = `    SELECT 
                            DATE(o.date_time) as date,
                            op.quantity,
                            IFNULL(op.stock_available,0) as stockout,
                            IFNULL(op.promo,0) as promo,
                            pp.product_id
                                
                            FROM
                                order_products op 
                            LEFT JOIN product p on p.product_id = op.product 
                            LEFT JOIN product pp on pp.product_id = p.parent_product
                            LEFT JOIN
                                orders o ON o.id = op.order
                            WHERE 
                                op.warehouse =  ${warehouse} AND pp.product_id is not null
                                AND  o.date_time >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
  
    let usedQuery = forParent == true ? parentQuery : primaryQuery;
  
    let databaseData = await database.raw(usedQuery);
    let productsData;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      productsData = this.mariaDbToJSON(databaseData);
    } else {
      productsData = databaseData.rows;
    }
    return productsData;
  }
  

  async getProductsForParallelFlexibleOptimizer(warehouse: any, interval: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`   SELECT 
      s.product as product_id, 
      
      COALESCE(op.quantity, 0) AS quantity
  FROM 
      stock s
  LEFT JOIN 
      order_products op ON op.warehouse = s.warehouse AND op.product = s.product
  LEFT JOIN
      orders o ON o.id = op.order
  WHERE 
      s.warehouse = ${warehouse}
      AND (o.date_time IS NULL OR o.date_time >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY))
  
  UNION ALL
  
  SELECT
      s.product as product_id,
      NULL AS quantity
  FROM
      stock s
  WHERE
      s.warehouse = 3
      AND s.product NOT IN (
          SELECT
              s.product
          FROM
              stock s
          LEFT JOIN
              order_products op ON op.warehouse = s.warehouse AND op.product = s.product
          LEFT JOIN
              orders o ON o.id = op.order
          WHERE
              s.warehouse = ${warehouse}
              AND (o.date_time IS NULL OR o.date_time >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY))
      )
    `);
    let productsData;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      productsData = this.mariaDbToJSON(databaseData);
    } else {
      productsData = databaseData.rows;
    }
    return productsData;
  }
  

  async getProductDataByBarcode(barcode: any, warehouseId: any, supplierId: any): Promise<any> { 
    let database = this._context.database;
    let mainQuery = `select p.name, p.product_id, p.attributes, pb.quantity, s.onhand_quantity, s.available_quantity,
                        s.ordered_quantity, s.reserved_quantity, sp.supplier, sp.delivery_term 
                     from product_barcode pb 
                     left join product p on p.product_id = pb.product  
                     left join stock s on s.product = p.product_id and s.warehouse = ${warehouseId}
                     left join supplier_products sp on sp.product = p.product_id and sp.supplier = ${supplierId}
                     where pb.barcode = ${barcode};`;
    if (supplierId == null) {
      mainQuery = `select p.name, p.product_id, p.attributes, pb.quantity, s.onhand_quantity, s.available_quantity,
                     s.ordered_quantity, s.reserved_quantity, sp.supplier, sp.delivery_term 
                   from product_barcode pb 
                   left join product p on p.product_id = pb.product  
                   left join stock s on s.product = p.product_id and s.warehouse = ${warehouseId}
                   where pb.barcode = ${barcode};`;
    }
    let databaseData = await database.raw(mainQuery);
    let productData;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      productData = this.mariaDbToJSON(databaseData);
    } else {
      productData = databaseData.rows;
    }
    return productData;
  }
  

  async getOrderProducts(orderId: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw('SELECT * from order_products op where op.`order` =' + orderId + ';');
    let orderProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      orderProducts = this.mariaDbToJSON(databaseData);
    } else {
      orderProducts = databaseData.rows;
    }
    return orderProducts;
  }
  
  async getReplenishment(replenishmentId: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(
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
  

  async getStockForOrder(orderId: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`select * from stock s
  left join order_products op on op.warehouse = s.warehouse and op.product = s.product
  where op.order = ${orderId}`);
    let orderProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      orderProducts = this.mariaDbToJSON(databaseData);
    } else {
      orderProducts = databaseData.rows;
    }
    return orderProducts;
  }
  
  async getOrderCheckData(warehouseId: any): Promise<any> {
    let database = this._context.database;
    let orderData;
    let query = `select o.id as order_id, op.product as product_id, ifnull(s.available_quantity, -1*op.quantity) as available_quantity, ifnull(sc.reserved_quantity, 0) as reserved_quantity, op.quantity, o.date_time as order_date, osh.date_created processing_date 
                  from order_products op 
                  inner join orders o on o.id = op.order 
                  inner join order_status_history osh on (o.id = osh.order_id and osh.status_id = ${Constants.orderPreparingStatus}) -- 50
                  left join stock s on s.product = op.product and s.warehouse = ${warehouseId}
                  left join (
                          select op.product, sum(s.reserved_quantity) as reserved_quantity from sales_channel sc 
                          inner join orders o on o.sales_channel = sc.id 
                          inner join order_status os on os.id = o.order_status 
                          inner join order_products op on op.order = o.id 
                          inner join stock s on s.product = op.product 
                          where sc.default_warehouse = ${warehouseId} and sc.ship_reserved = 1 and s.reserved_quantity > 0 and os.parent_status = ${Constants.receivedStatus} group by op.product 
                  ) as sc on sc.product = op.product 
                  where o.order_status in (${Constants.productsOrderedStatus}, ${Constants.missingPorductsStatus})
                  and op.warehouse = ${warehouseId}
                  order by osh.date_created asc, o.id;`;
    let databaseData = await database.raw(query);
    if (databaseData.rows == null || databaseData.rows == undefined) {
      orderData = this.mariaDbToJSON(databaseData);
    } else {
      orderData = databaseData.rows;
    }
    return orderData;
  }
  
  async checkOrderStock(orderId: any): Promise<boolean> {
    let database = this._context.database;
    let query = `SELECT * from orders o 
          left join order_products op on op.order = o.id 
          left join stock s on s.warehouse = op.warehouse AND s.product = op.product 
          where o.id = ${orderId}`;
    let databaseData = await database.raw(query);
    let orderProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      orderProducts = this.mariaDbToJSON(databaseData);
    } else {
      orderProducts = databaseData.rows;
    }
    let sufficientStock = true;
    for (let i = 0; i < orderProducts.length; i++) {
      if (
        orderProducts[i].available_quantity +
          orderProducts[i].reserved_quantity <
        orderProducts[i].quantity
      ) {
        sufficientStock = false;
        break;
      }
    }
    return sufficientStock;
  }
  

  async getSalesChannelDataByName(salesChannelName: string, cartEngine: string): Promise<any> {
    let database = await this._context.database;
    let query = `SELECT * FROM sales_channel WHERE name = '${salesChannelName}' AND cart_engine = '${cartEngine}'`;
    let databaseData = await database.raw(query);
    let salesChannelData;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      salesChannelData = this.mariaDbToJSON(databaseData);
    } else {
      salesChannelData = databaseData.rows;
    }
    return salesChannelData[0];
  }
  
  async getEnvValues(): Promise<any> {
    let envJosn = {
      write_log: true,
      transfer_default_calculation_type: Constants.defaultCalculationType,
      transfer_calculations_timespan: Constants.defaultCalculationTimespan,
      transfer_calculations_order_count: Constants.defaultCalculationOrderCount,
      transfer_calculations_buffer: Constants.defaultCalculationBuffer,
      transfer_calculations_moq: Constants.defaultCalculationMoq,
    };
    return envJosn;
  }
  

  async getArrivingProducts(warehouseHierarchy: string): Promise<any> {
    let database = this._context.database;
  
    let query = `SELECT product, warehouse, arriving_quantity, arrival_date
     FROM (
        (SELECT 
            pp.quantity as arriving_quantity,
            sp.product as product,
            p.warehouse as warehouse,
            pp.arrival_date as arrival_date
         FROM purchase p
         INNER JOIN purchase_products pp on pp.purchase = p.id 
         INNER JOIN supplier_products sp on sp.id = pp.product
         WHERE p.warehouse in (${warehouseHierarchy}) and p.status = 1
        )
        UNION
        (SELECT 
            stp.transfer_quantity as arriving_quantity,
            wp.product as product,
            st.warehouse_receiving as warehouse,
            stp.arrival_date
         FROM stock_transfer st 
         INNER JOIN stock_transfer_products stp on stp.stock_transfer = st.id
         INNER JOIN warehouse_products wp on wp.id = stp.product
         WHERE st.transfer_status = 1 and st.warehouse_receiving in (${warehouseHierarchy}))
     ) as sub 
     ORDER BY product;`;
  
    let databaseData = await database.raw(query);
    Log.toFile("ArrivingProducts.log", query);
    let arrivingProducts;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      arrivingProducts = this.mariaDbToJSON(databaseData);
    } else {
      arrivingProducts = databaseData.rows;
    }
  
    return arrivingProducts;
  }
  

  async getDueDateOrders(): Promise<any> {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 1);
    now.setSeconds(59);
    now.setMilliseconds(0);
    let currentDate = now;
    let currentDatePlusMinute = new Date(currentDate.getTime() + 1 * 60000);
  
    let { ItemsService } = this._context.services;
    let schema = await this._context.getSchema();
    let warehousePurchaseTimeTableService = new ItemsService(
      "warehouse_purchase_time_table",
      { schema }
    );
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
  

  async getAnalyzedPeriods(warehouseId: any): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT DISTINCT analysed_period
      FROM warehouse_products where warehouse = ${warehouseId}
    `);
    if (databaseData.rows == null || databaseData.rows == undefined) {
      databaseData = this.mariaDbToJSON(databaseData);
    } else {
      databaseData = databaseData.rows;
    }
    return databaseData;
  }
  
  
  // async getBatchSalesData(warehouseSrc: any, warehouseDst: any, period: number | null): Promise<any> {
  //   period = period == null ? process.env.TRANSFER_CALCULATION_TIMESPAN : period;
  //   let database = this._context.database;
  //   let data = await database.raw(`SELECT    
  //     p.product_id,
  //     sum(op.quantity) as sales
  //   FROM stock src
  //   INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = 1)
  //   INNER JOIN stock dst on src.product = dst.product
  //   INNER JOIN product p ON (dst.product = p.product_id)
  //   LEFT JOIN warehouse_products pr on pr.product = p.parent_product and pr.warehouse = 1
  //   INNER JOIN order_products op on op.product = p.product_id and op.warehouse = 1
  //   INNER JOIN orders o ON o.id = op.order 
  //   WHERE src.warehouse = ${warehouseSrc} AND dst.warehouse = ${warehouseDst} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
  //   AND ((wdst.analysed_period = ${period} AND wdst.product_calculation_type = 1 AND (wdst.product_calculation_type != 0 OR p.parent_product is null)) 
  //   OR (pr.analysed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0 AND p.parent_product is not null))
  //   AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR wdst.product_calculation_type = 0 and pr.product_calculation_type = 5)
  //   AND o.date_time >= NOW() - INTERVAL ${period} DAY
  //   GROUP BY p.product_id;`);
  
  //   if (data.rows == null || data.rows == undefined) {
  //     data = this.mariaDbToJSON(data);
  //   } else {
  //     data = data.rows;
  //   }
    
  //   return data;
  // }
  

  // async getBatchDaysInStockData(warehouseSrc, warehouseDst, period) {
  //   let database = this._context.database;
  //   let data = database.raw(`SELECT    
  //     p.product_id,
  //     count(sh.id) as days_in_stock
  // FROM stock src
  // INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = 1)
  // INNER JOIN stock dst on src.product = dst.product
  // INNER JOIN product p ON (dst.product = p.product_id)
  // Left join warehouse_products pr on pr.product = p.parent_product and pr.warehouse = 1
  // inner join stock_history sh on sh.product = p.product_id and sh.warehouse = wdst.warehouse 
  // WHERE src.warehouse =  ${warehouseSrc} AND dst.warehouse = ${warehouseDst} AND ((src.available_quantity > 0 AND p.parent_product is not null) OR (p.parent_product IS NULL))
  // AND ((wdst.analysed_period =  ${period} AND   wdst.product_calculation_type =1 AND (wdst.product_calculation_type != 0  OR p.parent_product is null) ) 
  // OR ( pr.analysed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0  AND p.parent_product is not null))
  // AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR wdst.product_calculation_type = 0 and pr.product_calculation_type = 5))
  // AND sh.date >= NOW() - INTERVAL  ${period} DAY
  // GROUP BY p.product_id;`);
  //   if (data.rows == null || data.rows == undefined) {
  //     if (data.rows == null || data.rows == undefined) {
  //       data = this.mariaDbToJSON(data);
  //     } else {
  //       data = data.rows;
  //     }
  //     return data;
  //   }
  // }

  async getWarehouseProducts(
    warehouseSource: string,
    warehouseTarget: string,
    warehouseHierarchy: string,
    period: number | null,
    nested: boolean,
    usingEnv: boolean
): Promise<any> { 
    let envValues = await this.getEnvValues();
    let usedString = "";
    
    period = period == null 
        ? Number(envValues.transfer_calculations_timespan) 
        : period;
        
    let dynamicPeriod: string;
    let nullClauseAddition: string = "";
    
    if (usingEnv === true) {
        dynamicPeriod = `is null`;
        nullClauseAddition = `AND wdst.analysed_period IS NULL`;
    } else {
        dynamicPeriod = `= ${period}`;
    }
    
    let nonAutomaticCalculationClause: string = 
        ` AND (((  wdst.product_calculation_type IN (${warehouseHierarchy})` +
        (envValues.transfer_default_calculation_type > 1 
            ? ` OR wdst.product_calculation_type IS NULL` 
            : ``) +
        ` )AND (/*wdst.product_calculation_type != 0  OR */ p.parent_product is null ) ) 
    OR ( pr.product_calculation_type IN (${warehouseHierarchy}) AND wdst.product_calculation_type = 0  AND p.parent_product is not null)) -- nonautomatic setting 
    `; // -- leistyi be sales history ir stock history  "Paima visus ne automatinius produktus ne pirmo tipo" -- NESTED FALSE
    
    let mainWhereClause: string = 
        ` AND ((wdst.analysed_period  ${dynamicPeriod} AND   wdst.product_calculation_type =1 AND (wdst.product_calculation_type != 0  OR p.parent_product is null) ) 
        OR ( pr.analysed_period  ${dynamicPeriod} ${nullClauseAddition} AND (pr.product_calculation_type = 1` +
        (envValues.transfer_default_calculation_type == 1
            ? ` OR pr.product_calculation_type IS NULL`
            : ``) +
        ` )AND wdst.product_calculation_type = 0  AND p.parent_product is not null))`; // sitas paima visus automatinisu su savo setingais NESTED TRUE
    
    let envSettingsClause: string = 
        `AND ((( wdst.product_calculation_type = 1` +
        (envValues.transfer_default_calculation_type == 1
            ? ` OR wdst.product_calculation_type IS NULL`
            : ``) +
        ` )AND wdst.product_calculation_type = 0  AND p.parent_product is null  ) 
        OR (wdst.product_calculation_type = 0  AND p.parent_product is not null AND (pr.product_calculation_type = 0  AND (pr.product_calculation_type = 1 ` +
        (envValues.transfer_default_calculation_type == 1
            ? ` OR pr.product_calculation_type IS NULL`
            : ``) +
        `)) -- env settings
        `; // jei env setting calcultation type = 1
    
    if (nested === true) {
        if (period == null) {
            usedString = envSettingsClause;
            //  console.log("envSettingsClause\n\n")
        } else {
            usedString = mainWhereClause;
            // console.log("mainWhereClause\n\n")
        }
    } else {
        usedString = nonAutomaticCalculationClause;
        // console.log("nonAutomaticCalculationClause\n\n")
    }
    
    period = period == null
        ? Number(envValues.transfer_calculations_timespan)
        : period;
        
    let database = this._context.database;
    let query: string;

    let outerQueryDynamicPart: string = 
        nested === false
            ? ``
            : `,
            IFNULL(days_in_stock.days_in_stock,0) as days_in_stock,
            IFNULL(sales_data.sales , 0) as sales,
            IFNULL(sales_data.ordered_sales, 0) as ordered_sales`;

    let outerQuerry: string = `SELECT
        ${warehouseSource} as warehouse_src,
        big_data.warehouse,
        big_data.product_id,
        big_data.buffer,
        big_data.ordered AS ordered_quantity,
        big_data.reserved AS reserved_quantity,
        big_data.available AS available_quantity,
        big_data.onhand AS onhand_quantity,
        big_data.parent_type,
        big_data.divisible,
        big_data.wh_moq,
        big_data.parent_analysed_period,
        big_data.parent_order_count,
        big_data.parent_buffer,
        big_data.parent_wh_moq,
        big_data.kmeans_centroid
        ${outerQueryDynamicPart}

        FROM (
        
        SELECT    
        
            wdst.warehouse,
            p.product_id,
            p.name,
            p.parent_product,
            p.divisible,
            
            IFNULL(dst.ordered_quantity,0) AS ordered,
            IFNULL(dst.reserved_quantity,0) AS reserved,
            IFNULL(dst.available_quantity,0) AS available,
            IFNULL(dst.onhand_quantity,0) AS onhand,
            wdst.moq AS wh_moq,
            wdst.product_calculation_type,
            IFNULL(wdst.buffer,1) as buffer,
            wdst.analysed_period,
            wdst.min_order_count,
            wdst.transfer_only_full_package,
            IFNULL(wdst.kmeans_centroid,0) as kmeans_centroid,
            IFNULL(pr.product_calculation_type,1) AS parent_type,
            pr.analysed_period AS parent_analysed_period,
            pr.min_order_count AS parent_order_count,
            IFNULL(pr.buffer,1) AS parent_buffer,
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
        AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR wdst.product_calculation_type = 0 and pr.product_calculation_type = 5)
        
        
        ) big_data`;
        
    let salesQuerry: string = ` LEFT JOIN (
        SELECT
        p.product_id,
        SUM(IF (op.product_calculation_type IN (1,2),op.quantity ,0)) AS sales,
        SUM(IF (op.product_calculation_type IN (3,4),op.quantity ,0)) AS ordered_sales,
        op.warehouse
        FROM
        warehouse_products wdst
        INNER JOIN product p ON (wdst.product = p.product_id)
        LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse =  ${warehouseTarget}
        INNER JOIN warehouse wh ON wdst.warehouse = wh.id
        INNER JOIN order_products op ON op.product = p.product_id 
        INNER JOIN orders o ON o.id = op.order
        -- select parent warehouse product sales trough all child warehouses included
        WHERE wdst.warehouse =  ${warehouseTarget} AND op.warehouse IN (${warehouseHierarchy}) 
            
        AND o.date_time >= NOW() - INTERVAL ${period} DAY
    GROUP BY
        p.product_id, op.warehouse      
    ) sales_data ON sales_data.product_id = big_data.product_id AND sales_data.warehouse = big_data.warehouse`;

    let daysInStockQuerry: string = `LEFT JOIN (
        
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
    AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.product_calculation_type = 0 and pr.product_calculation_type = 5))
    AND sh.date >= NOW() - INTERVAL ${period} DAY
    GROUP BY p.product_id
    
    ) days_in_stock on days_in_stock.product_id = big_data.product_id`;

    if (nested === true) {
        query = `${outerQuerry} ${daysInStockQuerry} ${salesQuerry};`;
    } else {
        query = outerQuerry;
    }

    Log.toFile("WarehouseTransferQuery.log", query);

    let databaseData = await database.raw(query);
    
    if (databaseData.rows == null || databaseData.rows == undefined) {
        databaseData = this.mariaDbToJSON(databaseData);
    } else {
        databaseData = databaseData.rows;
    }
    
    return databaseData;
}


async getWarehouseSales(warehouseId: string, startDate: string, endDate: string): Promise<any> {
  let schema = await this._context.getSchema();
  let { ItemsService } = this._context.services;
  let salesProductsService = new ItemsService("sales_product", { schema });
  let start = new Date(startDate);
  let end = new Date(endDate);
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


async getSalesData(products: string[], warehouseId: string, startDate: Date, currentDate: Date): Promise<any> {
  let database = this._context.database;
  let salesDbData = await database.raw(
    `SELECT op.product, SUM(op.quantity) as sales FROM orders o INNER JOIN order_products op ON o.id = op.order WHERE op.product IN (${products}) AND o.date_time BETWEEN '${startDate.toISOString()}' AND '${currentDate.toISOString()}' AND op.warehouse = ${warehouseId} AND NOT o.order_status = 4 GROUP BY op.product;`
  );
  let salesData = [];
  if (salesDbData.rows != null && salesDbData.rows != undefined) {
    salesData = salesDbData.rows;
  } else {
    salesData = this.mariaDbToJSON(salesDbData);
  }
  return salesData;
}


async getDaysInStockData(products: string[], warehouseId: string, startDate: Date, currentDate: Date): Promise<any> {
  let database = this._context.database;
  let daysInStockDbData = await database.raw(
    ` SELECT sh.product, COUNT(sh.date) AS days_in_stock FROM stock_history sh WHERE sh.product IN (${products}) AND sh.date BETWEEN '${startDate.toISOString()}' AND '${currentDate.toISOString()}' AND warehouse = ${warehouseId} GROUP BY sh.product;`
  );
  let daysInStockData = [];
  if (daysInStockDbData.rows != null && daysInStockDbData.rows != undefined) {
    daysInStockData = daysInStockDbData.rows;
  } else {
    daysInStockData = this.mariaDbToJSON(daysInStockDbData);
  }
  return daysInStockData;
}


async getCurrentStockData(products: number[], warehouseId: number): Promise<any> {
  let database = this._context.database;
  let currentStockDbData = await database.raw(
    ` select p.backorder,  p.parent_product, s.product ,s.available_quantity ,s.warehouse from stock s left join product p on s.product = p.product_id where s.product in (${products}) and s.warehouse = ${warehouseId};`
  );
  let currentStockData = [];
  if (
    currentStockDbData.rows != null &&
    currentStockDbData.rows != undefined
  ) {
    currentStockData = currentStockDbData.rows;
  } else {
    currentStockData = this.mariaDbToJSON(currentStockDbData);
  }
  return currentStockData;
}


async getWarehousePurchaseTimeTableData(
  warehouseId: string, 
  supplierId: string, 
  currentDate: Date
): Promise<any> {
    let database = this._context.database;
    let databaseData = await database.raw(
      `SELECT * from warehouse_purchase_time_table where order_date >= '${currentDate.toISOString()}' AND warehouse = ${warehouseId} AND supplier = ${supplierId} ORDER BY order_date ASC LIMIT 2;`
    );
    let timeTableData = [];
    if (databaseData.rows == null || databaseData.rows == undefined) {
      timeTableData = this.mariaDbToJSON(databaseData);
    } else {
      timeTableData = databaseData.rows;
    }
    return timeTableData;
}


  async getConfigs(supplierId:number, productId:number) {
    let database = this._context.database;
    let databaseData = await database.raw(
      ` select * from supplier_products sp left join attribute_config ac on ac.supplier_product = sp.id where sp.supplier =${supplierId} and sp.product = ${productId};`
    );
    let configs;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      configs = this.mariaDbToJSON(databaseData);
    } else {
      configs = databaseData.rows;
    }
    ////console.log("getConfigs")
    // //console.log(configs)
    return configs;
  }

  async getAllProducts(supplierId:number) {
    let database = this._context.database;
    let databaseData = await database.raw(`SELECT 
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
    } else {
      products = databaseData.rows;
    }
    // //console.log("\n\n\n\n\n\n")
    // //console.log(products[0])
    // fs__default["default"].writeFileSync(
    //   "products.txt",
    //   "raw log products:" + JSON.stringify(products[0])
    // );
    return products;
  }

  async getGroupedProducts(attributeValue:number, parentProduct:number, supplierId:number) {
    let database = this._context.database;
    let databaseData =
      await database.raw(` select sp.id,sp.delivery_term,sp.supplier,sp.is_parent,sp.product,p.name,p.attributes,p.parent_product,avp.attribute_value_id,avp.product_product_id from supplier_products sp left join product p on p.product_id = sp.product 
        left join attribute_value_product avp on avp.product_product_id = p.product_id where sp.supplier = ${supplierId} and avp.attribute_value_id = ${attributeValue} and p.parent_product =${parentProduct};`);
    let products;
    //
    if (databaseData.rows == null || databaseData.rows == undefined) {
      products = this.mariaDbToJSON(databaseData);
    } else {
      products = databaseData.rows;
    }
    // //console.log("\n\n\n\n\n\n")
    ////console.log(products[0])
    // fs__default["default"].writeFileSync(
    //   "products.txt",
    //   "raw log products:" + JSON.stringify(products[0])
    // );
    return products;
  }
  async getProductsForSupplyCalculation(
    supplier:number,
    warehouse :number,
    warehouses :number[],
    period:number,
    nested:boolean,
    usingEnv:boolean
  
  ) {
    let envValues = await this.getEnvValues();
    let database = this._context.database;
    let query;
    let usedString = ``;
    period =
      period == null
        ? Number(envValues.transfer_calculations_timespan)
        : period;
    let dynamicPeriod;
    let nullClauseAddition = "";
    if (usingEnv == true) {
      dynamicPeriod = `is null`;
      nullClauseAddition = `AND wdst.analysed_period IS NULL`;
    } else {
      dynamicPeriod = `= ${period}`;
    }

    let nonAutomaticCalculationClause =
      ` AND (((  wdst.product_calculation_type IN (2,3,4)` +
      (envValues.transfer_default_calculation_type > 1
        ? ` OR wdst.product_calculation_type IS NULL`
        : ``) +
      ` )AND (/*wdst.product_calculation_type != 0  OR */ p.parent_product is null ) ) 
       OR ( pr.product_calculation_type IN (2,3,4) AND wdst.product_calculation_type = 0  AND p.parent_product is not null)) -- nonautomatic setting 
       `; // -- leistyi be sales history ir stock history  "Paima visus ne automatinius produktus ne pirmo tipo" -- NESTED FALSE

    let mainWhereClause =
      ` AND ((wdst.analysed_period  ${dynamicPeriod} AND   wdst.product_calculation_type =1 AND (wdst.product_calculation_type != 0  OR p.parent_product is null) ) 
      OR ( pr.analysed_period  ${dynamicPeriod} ${nullClauseAddition} AND (pr.product_calculation_type = 1` +
      (envValues.transfer_default_calculation_type == 1
        ? ` OR pr.product_calculation_type IS NULL`
        : ``) +
      ` )AND wdst.product_calculation_type = 0  AND p.parent_product is not null) 
      OR (wh.analysed_period ${dynamicPeriod} AND (wh.product_calculation_type = 1 OR wh.product_calculation_type IS NULL) AND wdst.product_calculation_type = 0  
      AND  ((p.parent_product IS NOT NULL AND pr.product_calculation_type = 0 )OR p.parent_product IS NULL))
      )`; // sitas paima visus automatinisu su savo setingais NESTED TRUE

    let envSettingsClause =
      `AND ((( wdst.product_calculation_type = 1` +
      (envValues.transfer_default_calculation_type == 1
        ? ` OR wdst.product_calculation_type IS NULL`
        : ``) +
      ` )AND wdst.product_calculation_type = 0  AND p.parent_product is null  ) 
      OR (wdst.product_calculation_type = 0  AND p.parent_product is not null AND (pr.product_calculation_type = 0  AND (pr.product_calculation_type = 1 ` +
      (envValues.transfer_default_calculation_type == 1
        ? ` OR pr.product_calculation_type IS NULL`
        : ``) +
      `)) -- env settings
      `; // jei env setting calcultation type = 1
    if (nested == true) {
      if (period == null) {
        usedString = envSettingsClause;
      } else {
        usedString = mainWhereClause;
      }
    } else {
      usedString = nonAutomaticCalculationClause;
    }
    /*  AND (
            (wdst.analysed_period = ${period} AND wdst.product_calculation_type = 1 AND (wdst.product_calculation_type != 0  OR p.parent_product IS NULL))
            OR (pr.analysed_period = ${period} AND pr.product_calculation_type = 1 AND wdst.product_calculation_type = 0  AND p.parent_product IS NOT NULL)
        )
        AND (wdst.product_calculation_type IS NULL OR NOT wdst.product_calculation_type = 5 OR (wdst.product_calculation_type = 0  AND pr.product_calculation_type = 5))*/
    let outerQueryDynamicPart =
      nested == false
        ? ``
        : `,
        IFNULL(days_in_stock.days_in_stock,0) as days_in_stock,
        IFNULL(sales_data.sales , 0) as sales,
        IFNULL(sales_data.ordered_sales, 0) as ordered_sales`;
    // ,
    //sales_data.orders_count
    //used string assigment here ( logic by nested / not nested)
    let outerQuerry = `SELECT
    big_data.warehouse,
    big_data.attribute_config_data,
      big_data.product_id,
      big_data.supplier_product_id,
      big_data.name,
      big_data.parent_product,
      big_data.backorder,
      big_data.divisible,
      big_data.delivery_term, -- from supplier product
      big_data.is_parent,
      big_data.ordered AS ordered_quantity,
      big_data.reserved AS reserved_quantity,
      big_data.available AS available_quantity,
      big_data.onhand AS onhand_quantity,
      IFNULL(big_data.moq,0) as wh_moq,
      big_data.product_calculation_type,
      big_data.buffer,
      big_data.analysed_period,
      big_data.min_order_count,
      big_data.transfer_only_full_package,
      big_data.attribute_value_id,
      big_data.parent_type,
      big_data.parent_analysed_period,
      big_data.parent_order_count,
      big_data.parent_buffer,
      big_data.parent_moq as parent_wh_moq,
      big_data.attribute_values,
      big_data.attribute_values_ids,
       big_data.attribute_config_group,
      big_data.childs,
       big_data.supplier_moq as moq, -- from supplier product
       big_data.supplier_parent_moq, -- from supplier parent moq
       big_data.supplier_parent_delivery_time, 
       big_data.attribute_config_id,
       big_data.attribute_config_moq,
       big_data.attribute_config_delivery_time,
       big_data.kmeans_centroid,
        ROUND(parent_price_data.price,1) as parent_price,
        parent_price_data.quantity_in_package as parent_quantity_in_package,
        ROUND(price_data.price,1) as price,
        price_data.quantity_in_package
    ${outerQueryDynamicPart}
FROM (
  SELECT
  wdst.warehouse,
  p.product_id,
  p.name,
  p.parent_product,
  p.divisible,
  p.backorder,
  sp.id as supplier_product_id ,
  sp.delivery_term,
  p.is_parent,
  sp.moq as supplier_moq,
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
  wdst.analysed_period,
  wdst.min_order_count,
  wdst.transfer_only_full_package,
  IFNULL(wdst.kmeans_centroid,0) as kmeans_centroid,
  avp.attribute_value_id,
  IF (pr.product_calculation_type = 0 OR ISNULL(pr.product_calculation_type) , IF(wh.product_calculation_type = 0 OR ISNULL(wh.product_calculation_type),${envValues.transfer_default_calculation_type},wh.product_calculation_type),pr.product_calculation_type) AS parent_type,
  IF (pr.analysed_period = 0 OR ISNULL(pr.analysed_period) , IF(wh.analysed_period = 0 OR ISNULL(wh.analysed_period),${envValues.transfer_calculations_timespan},wh.analysed_period),pr.analysed_period) AS parent_analysed_period,
  IF (pr.min_order_count = 0 OR ISNULL(pr.min_order_count) , IF(wh.min_order_count = 0 OR ISNULL(wh.min_order_count),${envValues.transfer_calculations_order_count},wh.min_order_count),pr.min_order_count) AS parent_order_count,
  IF (pr.buffer = 0 OR ISNULL(pr.buffer) , IF(wh.buffer = 0 OR ISNULL(wh.buffer),${envValues.transfer_calculations_buffer},wh.buffer),pr.buffer) AS parent_buffer,
  IF (pr.moq = 0 OR ISNULL(pr.moq) , IF(wh.moq = 0 OR ISNULL(wh.moq),${envValues.transfer_calculations_moq},wh.moq),pr.moq) AS parent_moq,
  pr.product,
   GROUP_CONCAT(CONCAT(a.name, ':', av.value) ORDER BY a.id) AS attribute_values,
   GROUP_CONCAT(av.id ORDER BY av.id) AS attribute_values_ids,
  IFNULL(psp.id , sp.id) as supplier_parent_product_id,
  psp.moq as supplier_parent_moq,
  psp.delivery_term as supplier_parent_delivery_time,
  ac.id as attribute_config_id,
  ac.moq as attribute_config_moq,
  ac.delivery_time as attribute_config_delivery_time
    
  FROM
  supplier_products sp
      INNER JOIN warehouse_products hdst ON (sp.product = hdst.product  AND hdst.warehouse = ${warehouse}) -- helper filter , filtering products that only exists in MAIN parent warehouse
      INNER JOIN warehouse_products wdst ON (hdst.product = wdst.product  AND wdst.warehouse IN (${warehouses}))
      INNER JOIN warehouse wh ON wdst.warehouse = wh.id
      INNER JOIN product p ON (wdst.product = p.product_id) -- main product id 
      LEFT JOIN stock dst ON wdst.product = dst.product AND dst.warehouse = wdst.warehouse-- destination stock
      LEFT JOIN product cp on p.product_id = cp.parent_product -- child product 
      LEFT JOIN attribute_value_product avp ON avp.product_product_id = p.product_id -- joining 
      LEFT JOIN attribute_value av ON av.id = avp.attribute_value_id
      LEFT JOIN attributes a ON a.id = av.attribute
      LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse = wdst.warehouse -- parent wh product
      LEFT JOIN supplier_products psp on psp.product = p.parent_product and psp.supplier = sp.supplier -- parent supplier product join
      LEFT JOIN attribute_config ac on ac.attribute_value = av.id AND ac.supplier_product = psp.id
  
  WHERE
      sp.supplier = ${supplier}
        ${usedString}
    GROUP BY
        p.product_id , sp.id  , wdst.warehouse
) big_data`;
    let daysInStockQuerry = `LEFT JOIN (
  SELECT
  sh.warehouse ,
  p.product_id,
  COUNT(sh.id) AS days_in_stock
  FROM
  stock src
  INNER JOIN warehouse_products wdst ON (src.product = wdst.product AND wdst.warehouse = ${warehouse})
  INNER JOIN warehouse wh ON wdst.warehouse = wh.id
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
SUM(IF (op.product_calculation_type IN (1,2),op.quantity ,0)) AS sales,
SUM(IF (op.product_calculation_type IN (3,4),op.quantity ,0)) AS ordered_sales,
op.warehouse
FROM
warehouse_products wdst
INNER JOIN product p ON (wdst.product = p.product_id)
LEFT JOIN warehouse_products pr ON pr.product = p.parent_product AND pr.warehouse =  ${warehouse}
INNER JOIN warehouse wh ON wdst.warehouse = wh.id
INNER JOIN order_products op ON op.product = p.product_id 
INNER JOIN orders o ON o.id = op.order
-- select parent warehouse product sales trough all child warehouses included
WHERE wdst.warehouse =  ${warehouse} AND op.warehouse IN (${warehouses}) 
    
      AND o.date_time >= NOW() - INTERVAL ${period} DAY
  GROUP BY
      p.product_id, op.warehouse      
) sales_data ON sales_data.product_id = big_data.product_id AND sales_data.warehouse = big_data.warehouse
 LEFT JOIN (
WITH RankedPrices AS (
    SELECT
        supplier_products,
        price,
        quantity_in_package,
        is_default,
        ROW_NUMBER() OVER (
            PARTITION BY supplier_products
            ORDER BY
                is_default DESC,               -- Priority 1: is_default flag (1 first, then 0)
                quantity_in_package ASC        -- Priority 2: smallest quantity_in_package
        ) AS rn
    FROM
        product_price
)
SELECT
    supplier_products,
    price,
    quantity_in_package,
    is_default
FROM
    RankedPrices
WHERE
    rn = 1 )as parent_price_data on big_data.supplier_parent_product_id = parent_price_data.supplier_products
LEFT JOIN (
WITH RankedPrices AS (
    SELECT
        supplier_products,
        price,
        quantity_in_package,
        is_default,
        ROW_NUMBER() OVER (
            PARTITION BY supplier_products
            ORDER BY
                is_default DESC,               -- Priority 1: is_default flag (1 first, then 0)
                quantity_in_package ASC        -- Priority 2: smallest quantity_in_package
        ) AS rn
    FROM
        product_price
)
SELECT
    supplier_products,
    price,
    quantity_in_package,
    is_default
FROM
    RankedPrices
WHERE
    rn = 1 )as price_data on price_data.supplier_products = big_data.supplier_product_id 

`;
    // ,
    //COUNT(o.id) as orders_count
    if (nested == true) {
      query = `${outerQuerry} ${daysInStockQuerry} ${salesQuerry};`;
    } else {
      query = outerQuerry;
    }
   
    let databaseData = await database.raw(query);
    if (databaseData.rows == null || databaseData.rows == undefined) {
      databaseData = this.mariaDbToJSON(databaseData);
    } else {
      databaseData = databaseData.rows;
    }
    
      //let message = `function getProductsForSupplyCalculation \n\n`+query+`\n\n`+JSON.stringify(databaseData)+`\n\n`;
      //Log.toFile("getProductsForSupplyCalculation.log",message);
      Log.toFile("supplyCalculationQuery.log",query);
    
    return databaseData;
  }
  // async getWarehouseHierarchy(warehouseId) {
  //   let database = this._context.database;
  //   let query = `select DISTINCT parent_warehouse , child_warehouse from warehouse_relation wr where parent_warehouse is not null;`;
  //   let databaseData = await database.raw(query);
  //   if (databaseData.rows == null || databaseData.rows == undefined) {
  //     databaseData = this.mariaDbToJSON(databaseData);
  //   } else {
  //     databaseData = databaseData.rows;
  //   }
  //   let topHierarchy = new Map();
  //   let allWarehouses = [];
  //   function buildHierarchy(databaseData, parentId) {
  //     let hierarchy = new Map();
  //     let children = databaseData.filter(
  //       (item) => item.parent_warehouse == parentId
  //     );
  //     // recursive call for children hierarchy
  //     children.forEach((child) => {
  //       allWarehouses.push(child.child_warehouse);
  //       hierarchy.set(
  //         Number(child.child_warehouse),
  //         buildHierarchy(databaseData, Number(child.child_warehouse))
  //       );
  //     });
  //     return hierarchy;
  //   }
  //   topHierarchy.set(
  //     Number(warehouseId),
  //     buildHierarchy(databaseData, Number(warehouseId))
  //   );
  //   return { hierarchy: topHierarchy, warehouses: allWarehouses };
  // }
  async getWarehouseHierarchy(warehouseId: string): Promise<any> {
    let database = this._context.database;
    let query = `SELECT DISTINCT parent_warehouse, child_warehouse FROM warehouse_relation WHERE parent_warehouse IS NOT NULL;`;
    let databaseData = await database.raw(query);

    if (databaseData.rows == null || databaseData.rows == undefined) {
      databaseData = this.mariaDbToJSON(databaseData);
    } else {
      databaseData = databaseData.rows;
    }

    let warehouseMap = new Map<number, Set<number>>();

    // Create a map of parent to children
    //@ts-ignore
    databaseData.forEach(item  => {
      const parentId = Number(item.parent_warehouse);
      const childId = Number(item.child_warehouse);

      if (!warehouseMap.has(parentId)) {
        warehouseMap.set(parentId, new Set());
      }
      //@ts-ignore
      warehouseMap.get(parentId).add(childId);
    });

    function buildHierarchy(parentId: number, allWarehouses: Set<number>): Map<number, any> {
      let hierarchy = new Map<number, any>();
      const children = warehouseMap.get(parentId) || new Set();

      for (let childId of children) {
        allWarehouses.add(childId); // Add child only if it is part of the hierarchy.
        hierarchy.set(childId, buildHierarchy(childId, allWarehouses));
      }

      return hierarchy;
    }

    let allWarehouses = new Set<number>();
    let topHierarchy = new Map<number, any>();

    if (warehouseMap.has(Number(warehouseId))) { // Check if warehouseId exists in the map
        topHierarchy.set(Number(warehouseId), buildHierarchy(Number(warehouseId), allWarehouses));
    }

    let message = `function getWarehouseHierarchy \n\n` + query + `\n\n` + JSON.stringify(topHierarchy) + `\n\n`;

    Log.toFile("getWarehouseHierarchy.log", message);
    if(topHierarchy.size === 0){
      topHierarchy.set(Number(warehouseId), new Map());  // TODO - doublecheck the logic
    }

    return { 
      hierarchy: topHierarchy, 
      warehouses: Array.from(allWarehouses) 
    };
}









  async getWarehouseProductsCluster(warehouseId:number, period:number, startDate:Date) {
    const database = this._context.database;
    console.log("data retrieval function started");
    let startTime = process.hrtime();

    let dateQuery = "";
    let year = startDate.getFullYear();
    let month = ("0" + (startDate.getMonth() + 1)).slice(-2);
    let day = ("0" + startDate.getDate()).slice(-2);
    let formattedDate = `${year}-${month}-${day}`;
    if (startDate != null) {
      dateQuery = `and o.date_time > ${formattedDate} `;
    }

    let periodQuery = "";
    if (period != null) {
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
       `;

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
    let databaseData = await database.raw(query);
    let data;
    if (databaseData.rows == null || databaseData.rows == undefined) {
      data = this.mariaDbToJSON(databaseData);
    } else {
      data = databaseData.rows;
    }
    let endTime = process.hrtime(startTime);
    let executionTimeInSec = endTime[0] + endTime[1] / 1e9;
    console.log(
      "data retrieval function ended , it took " +
        executionTimeInSec +
        " ms to execute"
    );

    return data;
  }

  async getOrderByExternalId(externalId:number){
    const database = this._context.database;
    let data = await database.raw(`SELECT * FROM orders WHERE sales_channel_order_id = ${externalId};`);
    let orders;
    if (data.rows == null || data.rows == undefined) {
      orders = this.mariaDbToJSON(data);
    } else {
      orders = data.rows;
    }
    if(orders.length > 0){
    return orders[0].id;
    }
    else{
      return null;
    }
  }

  async getAllWarehouseProductsCluster(warehouseId:number) {
    const database = this._context.database;
    let data = await database.raw(
      "SELECT s.product FROM stock s left join order_products op on op.product = s.product left join orders o on o.id = op.`order` WHERE s.warehouse = " +
        warehouseId +
        " and o.date_time >= CURDATE() - INTERVAL " +
        Constants.kmeansProductRetrievalInterval +
        " DAY;"
    );
    let products;
    if (data.rows == null || data.rows == undefined) {
      products = this.mariaDbToJSON(data);
    } else {
      products = data.rows;
    }

    return products;
  }

  async getSalesProductsCluster(productId:number) {
    const database = this._context.database;
    let data = await database.raw(
      "SELECT op.quantity FROM order_products op left join orders o on o.id = op.`order` WHERE product = " +
        productId +
        " and o.date_time >= CURDATE() - INTERVAL " +
        Constants.kmeansStatisticCalculationsInterval +
        " DAY;"
    );
    let products;
    if (data.rows == null || data.rows == undefined) {
      products = this.mariaDbToJSON(data);
    } else {
      products = data.rows;
    }

    return products;
  }

  async getWarehouses(){
    let database = this._context.database;
    let data = await database.raw("SELECT id FROM warehouse;");
    let warehouses;
    if (data.rows == null || data.rows == undefined) {
      warehouses = this.mariaDbToJSON(data);
    } else {
      warehouses = data.rows;
    }
    return warehouses;
  }

  async getOrderProductsCluster(productId:number, timespan:number) {
    const { ItemsService } = this._context.services;
    let schema = await this._context.getSchema();
  //  let orderService = new ItemsService("orders", { schema });
    let salesProductService = new ItemsService("order_products", { schema });
    let currentDate = new Date();
    currentDate.setHours(currentDate.getHours() + 2);
    let pastDate = new Date();
    console.log(currentDate);

    pastDate.setMonth(pastDate.getMonth() - timespan);

    console.log(pastDate);
    let data = await salesProductService.readByQuery({
      filter: {
        _and: [
          { product: { _eq: productId } },
          { order: { date_time: { _between: [pastDate, currentDate] } } },
        ],
      },
    });
    return data;
  }
  async getOrderWarehouseProductsCluster(productId:number, warehouseId:number, timespan:number) {
    const { ItemsService } = this._context.services;
    let schema = await this._context.getSchema();
   // let orderService = new ItemsService("orders", { schema });
    let salesProductService = new ItemsService("order_products", { schema });
    let currentDate = new Date();
    currentDate.setHours(currentDate.getHours() + 2);
    let pastDate = new Date();
    console.log(currentDate);

    pastDate.setMonth(pastDate.getMonth() - timespan);

    console.log(pastDate);
    let data = await salesProductService.readByQuery({
      filter: {
        _and: [
          { product: { _eq: productId } },
          { warehouse: { _eq: warehouseId } },
          { order: { date_time: { _between: [pastDate, currentDate] } } },
        ],
      },
    });
    return data;
  }

  async getStockTransferProduct(transferId:number, productId:number) {
    const database = this._context.database;
    let data = await database.raw(
      `SELECT * FROM stock_transfer_products WHERE stock_transfer = ${transferId} AND product = ${productId};`
    );
    let products;
    if (data.rows == null || data.rows == undefined) {
      products = this.mariaDbToJSON(data);
    } else {
      products = data.rows;
    }

    return products[0];// dont change this , sql query should return only one product anyway
  }

  async getMissingOrders() {
    console.log("dataProvider missing orders");
    const database = this._context.database;
    let missingOrders;
    let data = await database.raw("select * from temp_orders;");
    if (data.rows == null || data.rows == undefined) {
      missingOrders = this.mariaDbToJSON(data);
    } else {
      missingOrders = data.rows;
    }

    return missingOrders;
  }

  scrubData(data:any){
    let scrubedData
    if(data.rows ==null || data.rows == undefined){
        scrubedData = this.mariaDbToJSON(data);
    }
    else{
        scrubedData = data.rows;
    }
    return scrubedData;
}

  async getCountryByCode(code:string) {
    const database = this._context.database;
    let data = await database.raw(
      `SELECT * FROM country WHERE country_code = '${code}';`
    );
    let country;
    if (data.rows == null || data.rows == undefined) {
      country = this.mariaDbToJSON(data);
    } else {
      country = data.rows;
    }

    return country[0];
  }

  mariaDbToJSON(data:any) {
    let dataArray = [];
    let rows = data[0];
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      let jsonString = JSON.stringify(row);
      let jsonObject = JSON.parse(jsonString);
      dataArray.push(jsonObject);
    }
    return dataArray;
  }


}
export default DataProvider;
