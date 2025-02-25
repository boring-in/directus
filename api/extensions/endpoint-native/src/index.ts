//import Country from "./class/Country";
import Warehouse from "./class/Warehouse";
//import Supplier from "./class/Supplier";
import DataProvider from "./class/DataProvider";
import DataWriter from "./class/DataWriter";
//import SalesDataCalculator from "./class/SalesDataCalculator";
import PurchaseSizeCalculator from "./class/PurchaseSizeCalculator";
import TransferSizeCalculator from "./class/TransferSizeCalculator";
import Kmeans from "./model/kmeans/Kmeans";
import Holidays from "./model/holidays/Holidays";
import StockReplenishmentSync from "./model/stockReplenishmentSync/StockReplenishmentSync";
import WarehouseStatisticCalculator from "./class/WarehouseStatisticCalculator";
import Prestashop from "./model/prestashop/Prestashop";
import WoocommerceSync from "./class/WoocommerceSync/index";
import StockCheck from "./model/stockCheck/StockCheck";
import Order from "./class/Order";
import StockTransferSync from "./model/stockTransferSync/StockTransferSync";
import Constants from "./const/Constants";
import StockTakingSync from "./model/stockTakingSync/StockTakingSync";
import Barcode from "./model/barcode/Barcode";
import Log from "./class/Log";
import { ParallelFlexibleOptimizer } from "./class/ClusterAnalyzer";
import ProductAnalysisManager from "./class/ProductAnalysisManager";
import PdfGenerator from "./class/PdfGenerator";


import {useApi} from "@directus/extensions-sdk";
import { Sync } from "./class/Sync";
export default async (router,context) => {
    const dataWriter = new DataWriter(context);
    const dataProvider = new DataProvider(context);
	const database = context.database;
    const getSchema = context.getSchema;
    const {ItemsService} = context.services;
	router.get('/', (req, res) => res.send('Hello, World!'));

    router.post('/generate-pdf', async (req, res) => {
        try {
            const pdfGenerator = new PdfGenerator();
            const jsonData = req.headers['pdf-data'];
            
            if (!jsonData) {
                return res.status(400).send('Missing pdf-data in headers');
            }

            let data;
            try {
                data = JSON.parse(jsonData as string);
            } catch (error) {
                return res.status(400).send('Invalid JSON data in headers');
            }

            const pdf = await pdfGenerator.generatePdf('invoice', data);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=generated.pdf');
            res.send(pdf);
        } catch (error) {
            console.error('Error generating PDF:', error);
            res.status(500).send('Error generating PDF');
        }
    });

    router.get('/util/attribute_json_all', async (req, res) => {
        try {
            const schema = await getSchema();
            const productService = new ItemsService("product", { schema });
            
            // Get all products with their attribute values
            const products = await productService.readByQuery({
                fields: ['product_id', 'attribute_value.attribute_value_id.value', 'attribute_value.attribute_value_id.attribute.name'],limit:-1
            });

            for (const product of products) {
                if (product?.attribute_value) {
                   
                    const attributeJson: Record<string, string> = {};
                    for (const attributeValue of product.attribute_value) {
                        if (attributeValue?.attribute_value_id?.attribute?.name && attributeValue.attribute_value_id.value) {
                            attributeJson[attributeValue.attribute_value_id.attribute.name] = attributeValue.attribute_value_id.value;
                        }
                    }
              
                    await productService.updateOne(product.product_id, { attributes: attributeJson });
                }
            }

            res.sendStatus(200);
        } catch (error) {
            console.error('Error updating product attributes:', error);
            res.sendStatus(500);
        }
    });

    router.get('/interface/customer_address/:orderId', async (req, res) => {
        let schema= await getSchema()
        let orderService = new ItemsService("orders", { schema:schema});
        console.log(req.params.orderId)
        let order = await orderService.readOne(req.params.orderId);
        let address = await dataProvider.getAddressByCustomer(order.customer);
        console.log(address);
        res.send(address);

    });
    router.get('/interface/groups', async (req, res) => {
        let groups = await dataProvider.getGroups();
        res.send(groups);
    });

    router.get("/empty/" ,async (req,res) => {
        res.send({});
    });

    router.get('/interface/attributes', async (req, res) => {
        let attributes = await dataProvider.getAttributes();
       // console.log(attributes)
        res.send(attributes);
    });

    router.get('/interface/features', async (req, res) => {
        let features = await dataProvider.getFeatures();
       // console.log(features)
        res.send(features);
    });

    router.get('/interface/customer', async (req, res) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const search = req.query.search as string;

        let customers;
        
        if (search) {
            // Check if search string is numbers only
            const customers = await dataProvider.getCustomers(search);
            console.log(customers);
            res.send({
                data: customers,
               
            });
          } 
          // else {
        //     // Regular paginated list
        //     customers = await dataProvider.getCustomers(page, limit);
        //     res.send({
        //         data: customers,
        //         pagination: {
        //             page: page,
        //             limit: limit,
        //             total: customers.length > 0 ? customers[0].total_count : 0
        //         }
        //     });
        // }
    });

    router.get('/interface/child_customer/:parentId', async (req, res) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            let customers = await dataProvider.getChildCustomers(req.params.parentId, page, limit);
            res.send({
                data: customers,
                pagination: {
                    page: page,
                    limit: limit
                }
            });
        }
        catch(err){
            console.log(err)
            res.send(err)
        }
    });

    router.get('/interface/parent_products', async (req, res) => {
        console.log("trying to get parent products")
        let products = await dataProvider.getParentProducts();
        res.send(products);
    });

    router.get('/interface/child_products/:parentProductId', async (req, res) => {
        let products = await dataProvider.getChildProducts(req.params.parentProductId);
        console.log(products)
        console.log("child product length")
        console.log(products.length)
        
             res.send(products);
        

    });

    router.get('/interface/supplier_products/:supplierId', async (req, res) => {

    })

    router.get('/sku_sync',async (req,res)=>{
        let intervals = [1000,2000,3000,4000,5000,6000,7000,8000];
        for (let i = 0; i < 2; i++) {
            let query;
          if( i == 0) {
            query = 'SELECT * FROM temp_sku WHERE id <= ' + intervals[i];
          }
            else{
                query = 'SELECT * FROM temp_sku WHERE id > ' + intervals[i-1] + ' AND id <= ' + intervals[i];
            }
        let data = await database.raw(query);
            console.log(data);
        }
    });

    router.get('/order/copy_order/:orderType/:orderId', async (req, res) => {
        console.log("copy order point")
        //get order data
        let dataProvider = new DataProvider(context);
        let dataWriter = new DataWriter(context);
        let schema = await getSchema();
        let { ItemsService } = context.services;
        let order = await Order.getOrder(req.params.orderId,ItemsService,schema);
        let orderProducts = await dataProvider.getOrderProducts(req.params.orderId);
        let dublicateOrder = await dataWriter.createDublicateOrder(order,req.params.orderType);
        await dataWriter.createDublicateOrderProduct(orderProducts,dublicateOrder);
        // create dublicate order
        //create dublicate order products 
        //return new order id 
        
        res.json({data:dublicateOrder}).status(200);
    });

    router.get('/order/secondary_order_check/:warehouseId', async (req,res)=>{
        let stockCheck = new StockCheck(context);
        await stockCheck.afterReplenishmentCheck(req.params.warehouseId);
        res.sendStatus(200);
        
    })

    router.get("/order/check_stock/:orderId",async (req,res) => {
        let haveStock = false;
        let orderId = req.params.orderId;
        let dataProvider = new DataProvider(context);
        haveStock = await dataProvider.checkOrderStock(orderId);
        res.send({haveStock:haveStock});

    });

    router.get("/product_analysis",async (req,res) => {
        let productAnalysisManager = new ProductAnalysisManager(context,180);
        await productAnalysisManager.analyzeAndPersist();
        res.sendStatus(200);
    });

    router.get("/parallel_test/:rand", async (req, res) => {
        let dataProvider = new DataProvider(context);
        let productData = await dataProvider.getProductsForAnalyzers(3,180);
        let optimizer = new ParallelFlexibleOptimizer();
        console.log(productData)
        let result = await optimizer.analyzeBatchParallel(productData);
        result.successful_analyses.forEach(analysis => {
            if(analysis.product_id == 172617){
           console.log(analysis)
            }
        });

        console.log("\nVykdymo statistika:")
        console.log(`Bendras laikas: ${result.total_execution_time_ms.toFixed(2)} ms`);
        console.log(`Panaudoti workers: ${result.parallel_execution_details?.workers_used}`);
        console.log(`Vid. worker laikas: ${result.parallel_execution_details?.avg_worker_time_ms.toFixed(2)} ms`);
 

    });

	router.get("/test/:rand", async (req, res) => {
      let warehouse = new Warehouse(1);
        await warehouse.load(context);
        let test = warehouse.getSenderDeliveryDateInfo(new Date(),3);
        console.log(test);
        res.send(200);
    });



    router.get("/supplier_date_list/:warehouseId/:date", async (req, res, next) => {
        let warehouseId = req.params.warehouseId;
        let date = new Date(0);
        date.setUTCMilliseconds(req.params.date);
        let warehouse = new Warehouse(warehouseId);
        await warehouse.load(context);
        let dateList = await warehouse.getSuppliersOrderDateList(date);
        let warehouseName = warehouse.name;
        res.send({
            id: warehouseId,
            name: warehouseName,
            suppliers_date_list: dateList,
        });
    });
    router.get("/warehouse_purchase_timetable_backup", async (req, res) => {
        try {
            let dataWriter = new DataWriter(context);
            console.log("warehouse_purchase_timetable_backup");
            let { ItemsService } = context.services;
            let schema = await context.getSchema();
            let warehouseService = new ItemsService("warehouse", { schema });
            let warehousePurchaseTimeTableService = new ItemsService("warehouse_purchase_time_table", { schema });
            let warehouses = await warehouseService.readByQuery({ fields: ["id", "suppliers"] }, { limit: -1 });
            //console.log("warehouses")
            // console.log(warehouses)
            let currentDate = new Date();
            for (let i = 0; i < warehouses.length; i++) {
                let warehouseId = warehouses[i].id;
                let warehouse = new Warehouse(warehouseId);
                await warehouse.load(context);
                console.log("before getSuppliersOrderDateList");
                let dateList = await warehouse.getSuppliersOrderDateList(currentDate);
                // console.log("warehouse_purchase_timetable_backup - dateList:")
                console.log(dateList);
                for (let j = 0; j < dateList.length; j++) {
                    // console.log("warehouse_purchase_timetable_backup - for loop:")
                    let item = dateList[j];
                    let firstDelivery = await warehousePurchaseTimeTableService.createOne({
                        warehouse: warehouseId,
                        supplier: item.supplier_id,
                        order_date: item.date,
                        delivery_days: item.delivery_days,
                        delivery_date: item.delivery_arrival,
                    });
              
                    console.log("should start second delivery date");
               
                    let secondDeliveryData = await warehouse.getSuppliersOrderDate(item.delivery_arrival, item.supplier_id);
                    let secondDeliveryArrivalDate = new Date(secondDeliveryData.date);
                    let secondDeliveryValidDeliveryDays = warehouse.validDeliveryDays(secondDeliveryArrivalDate, secondDeliveryData.delivery_days);
                    secondDeliveryArrivalDate.setDate(secondDeliveryArrivalDate.getDate() +
                        secondDeliveryValidDeliveryDays);
                    console.log("second delivery date should be created now");
                    let secondDelivery = await warehousePurchaseTimeTableService.createOne({
                        warehouse: warehouseId,
                        supplier: item.supplier_id,
                        order_date: secondDeliveryData.date,
                        delivery_days: secondDeliveryData.delivery_days,
                        delivery_date: secondDeliveryArrivalDate,
                    });
                    console.log("secondDelivery id: " + secondDelivery);
                    let thirdDeliveryData = await warehouse.getSuppliersOrderDate(secondDeliveryArrivalDate, item.supplier_id);
                    let thirdDeliveryArrivalDate = new Date(thirdDeliveryData.date);
                    let thirdDeliveryValidDeliveryDays = warehouse.validDeliveryDays(thirdDeliveryArrivalDate, thirdDeliveryData.delivery_days);
                    thirdDeliveryArrivalDate.setDate(thirdDeliveryArrivalDate.getDate() + thirdDeliveryValidDeliveryDays);
                    let thirdDelivery = await warehousePurchaseTimeTableService.createOne({
                        warehouse: warehouseId,
                        supplier: item.supplier_id,
                        order_date: thirdDeliveryData.date,
                        delivery_days: thirdDeliveryData.delivery_days,
                        delivery_date: thirdDeliveryArrivalDate,
                    });
                    console.log("thirdDelivery id: " + thirdDelivery);
                }
            }
            res.sendStatus(200);
        }
        catch (err) {
            res.send(err);
        }
    });
    router.get("/single_supplier/:warehouseId/:supplierId/:date", async (req, res, next) => {
        let warehouseId = req.params.warehouseId;
        let suppliersId = req.params.supplierId;
        let date = new Date(0);
        date.setUTCMilliseconds(req.params.date);
        let warehouse = new Warehouse(warehouseId);
        await warehouse.load(context);
        let warehouseName = warehouse.name;
        let dateList:any;
        try{
         dateList = await warehouse.getSuppliersOrderDate(date, Number(suppliersId));
         res.send({
            id: warehouseId,
            name: warehouseName,
            suppliers_date: dateList,
        });
        }
        catch(err){
            res.send({
                id: warehouseId,
                name: warehouseName,
                suppliers_date: null,
            });
        }
       
        
    });
    router.get("/child_supply_daily_backup", async (req, res) => {
        try {
            let dataWriter = new DataWriter(context);
            let { ItemsService } = context.services;
            let schema = await context.getSchema();
            let warehouseService = new ItemsService("warehouse", { schema });
            let childSupplyTimeTableService = new ItemsService("warehouse_supply_time_table", { schema });
            let warehouses = await warehouseService.readByQuery({ fields: ["id"] }, { limit: ["-1"] });
            console.log("WAREHOUSES");
            console.log(warehouses);
            let currentDate = new Date();
            for (let j = 0; j < warehouses.length; j++) {
                let warehouseId = warehouses[j].id;
                let date = new Date(0);
                date.setUTCMilliseconds(currentDate);
                let warehouse = new Warehouse(warehouseId);
                await warehouse.load(context);
                let warehouseName = warehouse.name;
                let dateList = await warehouse.getChildsDeliveryInfo(date);
                for (let i = 0; i < dateList.length; i++) {
                    let item = dateList[i];
                    let minDate = new Date(item.delivery_date);
                    let maxDate = new Date(minDate);
                    maxDate.setDate(maxDate.getDate() + item.delivery_days);
                    let startDate = new Date(0);
                    startDate.setUTCMilliseconds(minDate.getTime());
                    let endDate = new Date(0);
                    endDate.setUTCMilliseconds(maxDate.getTime());
                    let workDaysCount = await warehouse.workDaysCount(startDate, endDate);
                    item.work_days_count = workDaysCount;
                    console.log(item);
                    dateList[i] = item;
                    console.log("\nDATELIST");
                    console.log(dateList[i]);
                }
                for (let x = 0; x < dateList.length; x++) {
                    let item = dateList[x];
                    let firstDelivery = await childSupplyTimeTableService.createOne({
                        warehouse_from: warehouseId,
                        warehouse_to: item.id,
                        shipment_date: item.delivery_date,
                        delivery_date: item.delivery_arrival_date,
                        delivery_days: item.delivery_days,
                        receiving_warehouse_workdays: item.work_days_count,
                    });
                    let secondDelivery = await childSupplyTimeTableService.createOne({
                        warehouse_from: warehouseId,
                        warehouse_to: item.id,
                        shipment_date: item.next_delivery_date,
                        delivery_date: item.next_delivery_arrival_date,
                    });
                }
            }
            res.sendStatus(200);
        }
        catch (err) {
            res.send(err.message);
        }
    });
    //laikas valandom sutvarkyti - valandos numusha dienas
    router.get("/child_supply/:warehouseId/:date", async (req, res) => {
        let warehouseId = req.params.warehouseId;
        let date = new Date(0);
        date.setUTCMilliseconds(req.params.date);
        let warehouse = new Warehouse(warehouseId);
        await warehouse.load(context);
        let warehouseName = warehouse.name;
        let dateList = await warehouse.getChildsDeliveryInfo(date);
        console.log(dateList);
        for (let i = 0; i < dateList.length; i++) {
            let item = dateList[i];
            let minDate = new Date(item.delivery_date);
            let maxDate = new Date(minDate);
            maxDate.setDate(maxDate.getDate() + item.delivery_days);
            let startDate = new Date(0);
            startDate.setUTCMilliseconds(minDate.getTime());
            let endDate = new Date(0);
            endDate.setUTCMilliseconds(maxDate.getTime());
            let workDaysCount = await warehouse.workDaysCount(startDate, endDate);
            item.work_days_count = workDaysCount;
            console.log(item);
            dateList[i] = item;
        }
        res.send({
            id: warehouseId,
            name: warehouseName,
            child_date_list: dateList,
        });
    });
    router.get("/single_child_supply/:warehouseId/:childId/:date", async (req, res) => {
        let warehouseId = req.params.warehouseId;
        let date = new Date(0);
        date.setUTCMilliseconds(req.params.date);
        let warehouse = new Warehouse(warehouseId);
        await warehouse.load(context);
        let childInfo = await warehouse.getChildDeliveryInfo(date, req.params.childId);
        res.send(childInfo);
    });
    router.get("/warehouse_work_days_count/:warehouseId/:startDate/:endDate", async (req, res) => {
        let warehouse = new Warehouse(req.params.warehouseId);
        await warehouse.load(context);
        let startDate = new Date(0);
        startDate.setUTCMilliseconds(req.params.startDate);
        let endDate = new Date(0);
        endDate.setUTCMilliseconds(req.params.endDate);
        let workDaysCount = await warehouse.workDaysCount(startDate, endDate);
        res.send({ name: warehouse.name, work_days_count: workDaysCount });
    });
    router.get("/warehouse_statistic/:warehouseId/:startDate/:endDate", async (req, res) => {
        new DataWriter(context);
        let warehouse = new Warehouse(req.params.warehouseId);
        await warehouse.load(context);
        let startDate = new Date(req.params.startDate);
        console.log(startDate);
        //startDate.setUTCMilliseconds(req.params.startDate);
        let endDate = new Date(req.params.endDate);
        console.log(endDate);
        new Date(req.params.startDate);
        new Date(req.params.endDate);
        //endDate.setUTCMilliseconds(req.params.endDate);
        let workDaysCount = await warehouse.workDaysCount(startDate, endDate);
        let dataProvider = new DataProvider(context);
        let warehouseSalesData = await dataProvider.getWarehouseSales(req.params.warehouseId, req.params.startDate, req.params.endDate);
        //console.log(warehouseSalesData)
        res.send({
            work_day_count: workDaysCount,
            warehouse_sales_data: warehouseSalesData,
        });
    });
    router.get("/warehouse_daily_workday_backup", async (req, res) => {
        try {
            let dataWriter = new DataWriter(context);
            let { ItemsService } = context.services;
            let schema = await context.getSchema();
            let warehouseService = new ItemsService("warehouse", { schema });
            let warehouses = await warehouseService.readByQuery({ fields: ["id"] }, { limit: ["-1"] });
            let currentDate = new Date();
            for (let i = 0; i < warehouses.length; i++) {
                let warehouseId = warehouses[i].id;
                let warehouse = new Warehouse(warehouseId);
                await warehouse.load(context);
                let isWorkday = warehouse.isWorkDay(currentDate);
                //console.log(isWorkday);
                if (isWorkday == true) {
                    await dataWriter.writeData("warehouse_workday_history", {
                        warehouse: warehouseId,
                        weekday: currentDate.getUTCDay(),
                    });
                }
            }
            //console.log(warehouses);
            res.sendStatus(200);
        }
        catch (err) {
            res.send(err.message);
        }
    });
    router.get("/warehouse_product_data/:warehouseId", async (req, res) => {
        context.services;
        context.getSchema();
        let warehouse = new Warehouse(req.params.warehouseId);
        await warehouse.load(context);
        let products = await warehouse.getWarehouseProducts();
        console.log(products);
        res.sendStatus(200);
    });

    router.get("/warehouse_transfer_calculations_in_form/:stockTransferId", async (req, res) => {
        let stockTransferId = req.params.stockTransferId;
        try {
           // let dataProvider = new DataProvider(context);
            let transferSizeCalculator = new TransferSizeCalculator();
           
            await transferSizeCalculator.formCalculation( stockTransferId, context);
            res.json({data:stockTransferId}).status(200);
        }
        catch (err) {
            console.log(err);
            res.send(err);
        }
        
    });
    router.get("/warehouse_transfer_calculations/:warehouseSource/:warehouseTarget", async (req, res) => {
        try {
           // let dataProvider = new DataProvider(context);
          //  let purchaseSizeCalculator = new PurchaseSizeCalculator();
            let transferSizeCalculator = new TransferSizeCalculator();
            let warehouseSource = req.params.warehouseSource;
            let warehouseTarget = req.params.warehouseTarget;
            await transferSizeCalculator.calculateTransferSize(warehouseSource, warehouseTarget, context);
        }
        catch (err) {
            console.log(err);
        }
        res.sendStatus(200);
    });
    // router.get("/purchase_size_calculator_cronjob", async (req, res) => {
    //     try {
    //         let dataProvider = new DataProvider(context);
    //         let purchaseSizeCalculator = new PurchaseSizeCalculator();
    //         let ordersDueData = await dataProvider.getDueDateOrders();
           
    //         for (let i = 0; i < ordersDueData.length; i++) {
    //             await purchaseSizeCalculator.calculatePurchaseSize(ordersDueData[i].supplier, ordersDueData[i].warehouse,  context);
    //         }
    //         res.sendStatus(200);
    //     }
    //     catch (err) {
    //         console.log(err);
    //         res.sendStatus(500);
    //     }
    // });

    
    router.get("/purchase_size_calculator/:purchase_id", async (req, res) => {
        try {
            let purchaseId = req.params.purchase_id;
            let purchaseSizeCalculator = new PurchaseSizeCalculator();
            let { ItemsService } = context.services;
            let schema = await context.getSchema();
            let purchaseService = new ItemsService("purchase", { schema: schema });
            let purchaseItem = await purchaseService.readOne(purchaseId);
  
            await purchaseSizeCalculator.calculatePurchaseSize(purchaseItem.supplier, purchaseItem.warehouse,purchaseId, context);
            res.json({data:purchaseId}).status(200);
        }
        catch (err) {
           Log.toFile("error",err.message,null);
            res.sendStatus(500);
        }

    });
    // router.post("/purchase_size_calculator_manual", async (req, res) => {
    //     try {
    //         console.log(req.headers);
    //         let key = req.headers.timetable_id;
    //         let purchaseSizeCalculator = new PurchaseSizeCalculator();
    //         let { ItemsService } = context.services;
    //         let schema = await context.getSchema();
    //         let warehousePurchaseTimeTableService = new ItemsService("warehouse_purchase_time_table", { schema: schema });
    //         let timeTableItem = await warehousePurchaseTimeTableService.readOne(key);
    //         //console.log(timeTableItem)
      
    //         await purchaseSizeCalculator.calculatePurchaseSize(timeTableItem.supplier, timeTableItem.warehouse, context);
    //         res.sendStatus(200);
    //     }
    //     catch (err) {
    //         console.log(err);
    //         res.sendStatus(500);
    //     }
    // });
    // This route calculates the purchase size for a given supplier, warehouse, and timespan
    router.get("/purchase_size_calculator/:supplierId/:warehouseId/:timespan/", async (req, res) => {
        try {
            // Extract the parameters from the request
            const { supplierId, warehouseId, timespan } = req.params;
            // Create a new instance of the PurchaseSizeCalculator class
            let purchaseSizeCalculator = new PurchaseSizeCalculator();
            // Call the calculatePurchaseSize method with the extracted parameters and a context object
            await purchaseSizeCalculator.calculatePurchaseSize(supplierId, warehouseId, timespan, context);
            // Send a 200 status code to indicate success
            res.sendStatus(200);
        }
        catch (err) {
            // Log any errors and send an error message to the client
            console.log(err);
            res.send(err.message);
        }
    });


    router.get("/kmeans/daily_recalc/:warehouse/:period/:date",async (req,res) => {
        let kmeans = new Kmeans(context);
        try{
        await kmeans.dailyRecalc(req.params.warehouse,req.params.period,req.params.date);
        await dataWriter.writeData("cronjob_log", {message: "Kmeans daily recalculation completed",cronjob_name: "kmeans_daily_recalc"});
        }
        catch(err){
            console.log(err);
            await dataWriter.writeData("cronjob_log", {message: err.message,cronjob_name: "kmeans_daily_recalc"});
        }
        res.sendStatus(200);
    });

    router.get("/kmeans/by_warehouse/:warehouseId",async (req,res) => {
        try{
        let kmeans = new Kmeans(context);
        await kmeans.byWarehouse(req.params.warehouseId);
        
        }
        catch(err){
            console.log(err);
        }
        res.sendStatus(200);
    });

    router.get("/kmeans/by_date/:productId/:months/:clusterNum",async (req,res) => {
        try{
        let kmeans = new Kmeans(context);
        await kmeans.byDate(req.params.productId,req.params.months,req.params.clusterNum);
        }
        catch(err){
            console.log(err);
        }
        sendStatus(200);
    });

    router.get("/kmeans/by_product_and_warehouse/:productId/:warehosueId/:months/:clusterNum",async (req,res) => {
        try{
        let kmeans = new Kmeans(context);
        await kmeans.withWarehouse(req.params.productId,req.params.warehouseId,req.params.months,req.params.clusterNum);
        }
        catch(err){
            console.log(err);
        }
        sendStatus(200);
    });

    router.get("/kmeans/default/:productId/:clusterNum",async (req,res) => {
        try{
        let kmeans = new Kmeans(context);
        await kmeans.default(req.params.productId,req.params.clusterNum);
        }
        catch(err){
            console.log(err);
        }
        res.sendStatus(200);
    });

    router.get("/order_status_update/:orderId/:inStatus" ,async (req,res) => {
        Log.toFile("order_status_update",`Order status update request received for order ${req.params.orderId} to status ${req.params.inStatus}`,true);
        try{
            let status = Constants.getMapedOrderStatus(Number(req.params.inStatus));
            if(status != null){
                let orderId = await dataProvider.getOrderByExternalId(req.params.orderId);
                Log.toFile("order_status_update",`OrderId found : ${orderId} `,true);
                if(orderId != null){
                    let { ItemsService } = context.services;
                    let schema = await context.getSchema();
                    let orderService = new ItemsService("orders", { schema: schema });
                    orderService.updateOne(orderId,{order_status:status});
                    Log.toFile("order_status_update",`Order status updated to : ${status} `,true);
                }
            }
        }
        catch(err){
            Log.toFile("order_status_update",err.message,true);
        }   
        res.sendStatus(200);
    });

    router.get('/stock_history_backup', async (req, res) =>{
        try{
		const database = context.database;
		await database.raw(`INSERT INTO stock_history (available_quantity,onhand_quantity,ordered_quantity,reserved_quantity,product,warehouse,date) 
                            SELECT s.available_quantity,s.onhand_quantity,s.ordered_quantity,s.reserved_quantity,s.product,s.warehouse,CURRENT_DATE as date 
                            FROM stock s
                            left join
                            (
                                select op.product , op.warehouse , op.stock_available , op.product_calculation_type , op.order from 
                                order_products op 
                                inner join orders o  on (o.id = op.order and DATE(o.date_time) = CURRENT_DATE() )
                                where  op.product_calculation_type in (1,2)
                                group by op.product , op.warehouse
                            ) as op on op.product = s.product and s.warehouse  = op.warehouse
                            where (onhand_quantity > 0 OR (op.product is not null )) and s.product is  not null and s.warehouse is not null  `);
                            
		await dataWriter.writeData("cronjob_log", {message: "Stock history backup completed",cronjob_name: "stock_history_backup"});
		res.sendStatus(200)
        }
        catch(err){
            await dataWriter.writeData("cronjob_log", {message: err.message,cronjob_name: "stock_history_backup"});
            res.send(500);
        }
        
	});

    router.get('/stock_sync/:warehouse/:product_id/:product_attribute_id/:quantity', async (req, res)=> {
        let stockReplenishmentSync = new StockReplenishmentSync(context);
        try{
        await stockReplenishmentSync.stockSync(req.params.warehouse,req.params.product_id,req.params.product_attribute_id,req.params.quantity);
        
        res.sendStatus(200);
        }
        catch(err){
            await dataWriter.writeData("replenishment_log", {message: err.message});
            res.send(200);
            
        }
    })

    router.get('/public_holidays/:country_code',async (req,res) =>{
        try{
        let holidays = new Holidays(context)
        await holidays.import(req.params.country_code);
        res.sendStatus(200)
        }
        catch(err){

        }
    })

    router.get('/public_holidays_by_year/:country_code/:year', async (req,res)=>{
        try{
            let holidays = new Holidays(context)
            await holidays.import(req.params.country_code,req.params.year);
            res.sendStatus(200)

        }
        catch(err){

        }
    });

    router.get('/warehouse_statistic/:warehouseId/:startDate/:endDate', async (req, res) => {
		console.log(req.params.startDate)
		let dataProvider = new DataProvider(context);
		let warehouseSaleData = await dataProvider.getWarehouseSales(req.params.warehouseId,req.params.startDate,req.params.endDate);
		console.log(warehouseSaleData)
		let warehouseStatisticCalculator = new WarehouseStatisticCalculator(warehouseSaleData);
		let warehouseStatistics = warehouseStatisticCalculator.statistic();
		console.log(warehouseStatistics);
        res.sendStatus(200)
    });

    router.get('/woocommerce/sync_product_brands/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.importAllBrands();
        res.sendStatus(200)
    });

    router.get('/woocommerce/sync_stock_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.syncAllSalesChannelStock();
        res.sendStatus(200)
    });

    router.get('/woocommerce/sync_tags_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.importAllTags();
        res.sendStatus(200)
    });

    router.get('/woocommerce/sync_groups_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.importAllGroups();
        res.sendStatus(200)
    });

    router.get('/woocommerce/sync_features_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.importAllFeatures();
        res.sendStatus(200)
    });

    

    router.post('/woocommerce/update_order',async (req,res)=>{
        try{
            let fullUrl = req.headers['x-wc-webhook-source'];
            let regex = /https?:\/\/(.*?)\//;
            let match = fullUrl.match(regex);
            let domain = match ? match[1] : null;
    
            console.log(domain);
            let metadata = req.body.meta_data;
            let posItem = metadata.find(obj => obj.key == '_pos_order_cashdrawer');
            let posId= null;
            if(posItem!=undefined){
                posId = posItem.value;
            }
            let orderId = req.body.id;
            let statusName = req.body.status;
            console.log(orderId)
            console.log(statusName)
    
    
    
            
                let schema = await getSchema();
                let salesChannelService = new ItemsService("sales_channel",{schema:schema});
                let salesChannel;
                if(posId == null){
                     salesChannel = await salesChannelService.readByQuery({filter:{_and:[{domain_name:domain},{OpenPos_outlet_id:{_null:true}}]}});
                }
                else{
                 salesChannel = await salesChannelService.readByQuery({filter:{_and:[{domain_name:domain},{OpenPos_outlet_id:posId}]}});
                }
                console.log(salesChannel);
                let wcSync = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
                await wcSync.localOrderStatusUpdate(orderId,statusName);
    
            }
            catch(err){
                console.log(err)
            }
            res.sendStatus(200);
    });

    router.get('/woocommerce/sync_attributes_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        await woocommerce.importAttributesFromWooCommerce();
    });

    router.get('/woocommerce/sync_products_downstream/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        let product = await woocommerce.syncAllProductsDownstream();
        res.send(product).status(200);
    });

    router.get('/woocommerce/get_product/:productId/:salesChannelId', async (req,res) => {
        let schema = await getSchema()
        let salesChannelService = new ItemsService("sales_channel",{schema:schema});
        let salesChannel = await salesChannelService.readByQuery({filter:{id:req.params.salesChannelId}});
        let woocommerce = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
        let product =  await woocommerce.syncProductDownstream(req.params.productId);
        res.send(product).status(200);
    });



    router.post('/woocommerce/order/:someNumber', async (req, res)  => {
        console.log(req.params.someNumber);
		try{
		//console.log(req.body);
		//console.log("------------- ORIGIN -------------\n\n\n");
		//console.log(req.headers.host);
        
		let fullUrl = req.headers['x-wc-webhook-source'];
		let regex = /https?:\/\/(.*?)\//;
		let match = fullUrl.match(regex);
		let domain = match ? match[1] : null;
		console.log(domain);
		let orderId = req.body.id;
	    console.log(orderId)



		
			let schema = await getSchema();
			let salesChannelService = new ItemsService("sales_channel",{schema:schema});
			let salesChannel;
			salesChannel = await salesChannelService.readByQuery({filter:{_and:[{domain_name:domain}]}});
			console.log(salesChannel);
			let wcSync = new WoocommerceSync(ItemsService,schema,salesChannel[0]);
			await wcSync.createOrder(orderId);

		//let orders = await api.get("orders/17520")
	//	console.log(orders.data.line_items);
	}
	catch(err){
		console.log(err)
	}
	res.send(200)
	});

   router.get('/prestashop/get_order/:order_id/:shop_id', async (req, res) => {
    // console.log("order import started before try")
    try{
       
        
       let prestashop = new Prestashop(context);
        await prestashop.getOrderMainTwo(req.params.order_id);
        Log.toFile("prestashop_order_import",`Order ${req.params.order_id} imported`,true);
        res.sendStatus(200);
    }
    catch(err){
        Log.toFile("prestashop_order_import_error",err.message,true);
        res.sendStatus(200)
    }
      
    
    });

 

    router.post("/sync/product" , async (req,res) => {
        let schema = await getSchema();
        let sync = new Sync(ItemsService, schema); 
        try{
        await sync.productSync(req);
        res.sendStatus(200);
        }
        catch(err){
            res.send(err);
        }
        
    });

    router.post("/sync/stock" , async (req,res) => {
        let schema = await getSchema();
        let sync = new Sync(ItemsService, schema); 
        try{
        await sync.stockSync(req);

        res.sendStatus(200);
        }
        catch(err){
            res.send(err);
        }
        
    });

    router.post("/sync/order" , async (req,res) => {
        console.log(req)
        let schema = await getSchema();
        let sync = new Sync(ItemsService, schema); 
        try{
            await sync.orderSync(req);
            res.sendStatus(200);
        }
        catch(err){
            res.send(err);
        }
    });


    router.get('/prestashop/get_orders/:random', async (req, res) => {
            process.env.PS_HOST ="gerilesiai.lt" ;
            process.env.PS_PORT ="3306";
            process.env.PS_USER ="csm2s4rex_lawree";
            process.env.PS_PASSWORD="4pGTqvC78JsgTSHG";
            process.env.PS_DATABASE="csm2s4rex_cosmo"
            let prestashop = new Prestashop(context);
            let ans = await prestashop.getOrders();
           
            res.sendStatus(200);
            
           
        
     
         
       
    }
    );

    router.get('/prestashop/get_order_status/:order_id/:shop_id', async (req, res) => {
        try{
            let prestashop = new Prestashop(context);
            await prestashop.getOrderStatus(req.params.order_id,req.params.shop_id);
            res.sendStatus(200);
        }
        catch(err){
            res.send(err);
        }
    });

    router.get('/stock_replenishment_sync', async (req, res)=> {
        let stockReplenishmentSync = new StockReplenishmentSync(context);
        let dataWriter = new DataWriter(context);
        try{
        await stockReplenishmentSync.replenishmentSync(req,res);
       
        await dataWriter.writeData("cronjob_log", {message: "Stock replenishment sync completed",cronjob_name: "stock_replenishment_sync"});
        res.sendStatus(200);
        }
        catch(err){
            await dataWriter.writeData("cronjob_log", {message: err.message,cronjob_name: "stock_replenishment_sync"});
            res.send(200);
       }
    //
		
		
	});

    router.get('/stock_transfer_sync', async (req, res) => {
        let stockTransferSync = new StockTransferSync(context);
        try{
            await stockTransferSync.syncWarehouseTransfers();
        }
        catch(err){
            console.log(err);
        }
        res.sendStatus(200);
    });

    router.get('/stock_taking_sync', async (req, res) => {
        let stockTakingSync = new StockTakingSync(context);
        try{
            await stockTakingSync.sync();
        }
        catch(err){
            console.log(err);
        }
        res.sendStatus(200);
    });

    router.get('/barcode/:barcode/:warehouse/:supplier', async (req, res) => {
        console.log("barcode request received");
        console.log(req.params.barcode);
        console.log(req.params.warehouse);
        console.log(req.params.supplier);
        let productData = await Barcode.getProduct(req.params.barcode,req.params.warehouse,req.params.supplier,context);
        console.log(productData);
        res.send(productData).status(200);

    });
    
}
