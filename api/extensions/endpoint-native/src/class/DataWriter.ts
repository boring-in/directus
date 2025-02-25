import fs from "fs";
import Constants from "../const/Constants";

class DataWriter {
  private _context: any;

  constructor(context: any) {
    this._context = context;
  }



  static log(fileName:string, data:any) {
    if (!Constants.log) return;

    try {
      if (typeof data !== "string" && !(data instanceof Buffer)) {
        data = String(data);
      }
      console.log(`Writing data to file ${fileName}:`, data);
      fs.appendFileSync(fileName, data);
    } catch (error) {
      console.error(`Error writing to file ${fileName}:`, error);
      throw error;
    }
  }
  async writeData(collection:string, queryJson:JSON) {
    let schema = await this._context.getSchema();
    let { ItemsService } = this._context.services;
    let itemsService = new ItemsService(collection, { schema });
    let itemId = await itemsService.createOne(queryJson);
    return itemId;
  }

  async updateData(collection:string, id:number, queryJson:JSON) {
    let schema = await this._context.getSchema();
    let { ItemsService } = this._context.services;
    let itemsService = new ItemsService(collection, { schema });
    let itemId = await itemsService.updateOne(id, queryJson);
    return itemId;
  }

  async persistHoliday(country:number, date:Date, holidayName:string, type:string) {
    let database = this._context.database;
    let query = `INSERT INTO public_holidays (country, date, name, type) VALUES (${country}, "${date}", "${holidayName}", "${type}")
    ON DUPLICATE KEY UPDATE id = id`;
    await database.raw(query);
  }

  async persistClusterAnalysis(warehouse:number,data:any) {
    let database = this._context.database;
    let clusterQuery = `UPDATE warehouse_products set analysis_method='${data.analysisMethod}', kmeans_centroid=${data.centroid} where product=${data.product} and warehouse=${warehouse}`;
    await database.raw(clusterQuery);

 
  }
  async persistStockAnalysis(data:any) {
    const database = this._context.database;
  
    // Build the SQL query with `INSERT ... ON DUPLICATE KEY UPDATE`
    const query = `
      INSERT INTO stock_analysis_data (
        warehouse, product, mean, standard_deviation, base_ratio, buffer_ratio, 
        promo_buffer_ratio, promo_uplift, min_stock_qty, buffer_qty, 
        promo_buffer_qty, reliability, period
      ) VALUES (
        ${data.warehouse}, ${data.product}, ${data.mean}, ${data.standardDeviation},
        ${data.baseRatio}, ${data.bufferRatio}, ${data.promoBufferRatio},
        ${data.promoUplift}, ${data.minStockQty}, ${data.bufferQty},
        ${data.promoBufferQty}, '${data.reliability}', '${data.period}'
      )
      ON DUPLICATE KEY UPDATE
        mean = ${data.mean},
        standard_deviation = ${data.standardDeviation},
        base_ratio = ${data.baseRatio},
        buffer_ratio = ${data.bufferRatio},
        promo_buffer_ratio = ${data.promoBufferRatio},
        promo_uplift = ${data.promoUplift},
        min_stock_qty = ${data.minStockQty},
        buffer_qty = ${data.bufferQty},
        promo_buffer_qty = ${data.promoBufferQty},
        reliability = '${data.reliability}';
    `;
  
    // Execute the query
    await database.raw(query);
  };
  
  
  

  async writeKmeansCalculatedData(data: any, productId: number): Promise<void> {
    const { ItemsService } = this._context.services;
    let schema = await this._context.getSchema();
    let dataService = new ItemsService("kmeans_calculated_data", { schema });
    let warehouseProductService = new ItemsService("warehouse_products", { schema });
    let centroidsJsonArr: Array<any> = [];
  
    for (let i = 0; i < data.res.centroids.length; i++) {
      let kmeansJson: any = {};
      kmeansJson = {
        centroid: data.res.centroids[i],
        cluster_size: data.res.clusterSizes[i],
        culster_min: data.res.clusterMinMax[i].min,
        cluster_max: data.res.clusterMinMax[i].max,
        cluster_percentage: data.res.clusterPercentages[i],
      };
      centroidsJsonArr.push(kmeansJson);
    }
  
    centroidsJsonArr.sort((a, b) => b.cluster_size - a.cluster_size);
  
    let clusterFirst = centroidsJsonArr[0];
    let clusterSecond = centroidsJsonArr[1];
    let selectedCentroid = clusterFirst.centroid;
  
    if (clusterSecond.cluster_size / clusterFirst.cluster_size >= 0.66) {
      selectedCentroid = clusterFirst.centroid < clusterSecond.centroid ? clusterSecond.centroid : clusterFirst.centroid;
    }
  
    // Search for existing data
    let existingData = await dataService.readByQuery({
      filter: {
        _and: [
          { product: { _eq: productId } },
          { warehouse: { _eq: data.warehouse } },
        ],
      },
    });
  
    if (existingData.length === 0) {
      await dataService.createOne({
        product: productId,
        calculated_data: centroidsJsonArr,
        time_stamps: data.timestamps,
        warehouse: data.warehouse,
      });
    } else {
      await dataService.updateOne(existingData[0].id, {
        calculated_data: centroidsJsonArr,
        time_stamps: data.timestamps,
      });
    }
  
    // Update warehouse_product add kmeans centroid
    let warehouseProduct = await warehouseProductService.readByQuery({
      filter: {
        _and: [
          { product: { _eq: productId } },
          { warehouse: { _eq: data.warehouse } },
        ],
      },
    });
  
    if (warehouseProduct.length !== 0) {
      await warehouseProductService.updateOne(warehouseProduct[0].id, { kmeans_centroid: selectedCentroid });
    }
  }
  

  async createDublicateOrder(orderData:any, type:string) {
    let database = this._context.database;
    let query = `INSERT INTO orders (address, 
         customer ,
         order_status ,
         payment_type ,
         sales_channel,
         sales_channel_order_id,
         shipping_price,
         shipping_type,
         shipping_tax,
         products_total_tax_incl,
         total_discount_tax_incl,
         total,
         source_order,
         type) 
         values ('${Number(orderData.address)}',
         ${orderData.customer},
         1,
         "${orderData.payment_type}",
         ${orderData.sales_channel},
         ${orderData.sales_channel_order_id},
         ${orderData.shipping_price},
         "${orderData.shipping_type}",
         ${orderData.shipping_tax},
         ${orderData.products_total_tax_incl},
         ${orderData.products_total_tax_incl + orderData.shipping_price},
         0,
         ${orderData.id},
         ${Number(type)})`;
    console.log(query);
    let result = await database.raw(query);

    return result[0].insertId;
  }

  async createDublicateOrderProduct(orderProducts:any[], orderId:number) {
   // let database = this._context.database;
    let schema = await this._context.getSchema();
    let { ItemsService } = this._context.services;
    let orderProductService = new ItemsService("order_products", {
      schema: schema,
    });
    for (let i = 0; i < orderProducts.length; i++) {
      await orderProductService.createOne({
        order: orderId,
        quantity: orderProducts[i].quantity,
        product: orderProducts[i].product,
        unit_price_tax_incl: orderProducts[i].unit_price_tax_incl,
        warehouse: orderProducts[i].warehouse,
        product_details: orderProducts[i].product_details,
        attributes: orderProducts[i].attributes,
        product_name: orderProducts[i].product_name,
        stock: orderProducts[i].stock,
      });
    }
    // create query for order products with for loop
    // let secondaryQuery = '';
    // for (let i = 0; i < orderProducts.length; i++) {
    //     let orderProduct = orderProducts[i];
    //     secondaryQuery += `(${orderProduct.full_price},${orderId},${orderProduct.product},${orderProduct.quantity},${orderProduct.tax_rate},${orderProduct.unit_price_tax_incl},${orderProduct.warehouse},'${orderProduct.product_details}','${orderProduct.attributes}','${orderProduct.product_name}',${orderProduct.stock})`;
    //     if (i !== orderProducts.length - 1) {
    //         secondaryQuery += ',';
    //     }
    // }
    // let mainQuery = `INSERT INTO order_products (full_price,order,product,quantity,tax_rate,unit_price_tax_incl,warehouse,product_details,attributes,product_name,stock) values ${secondaryQuery}`;
    // await database.raw(mainQuery);
  }

  
}
export default DataWriter;
