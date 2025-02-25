class BarcodeUtil {

    static async processBarcodes(scans) {
        const { schema, targetService, targetField, supplier, warehouse } = context;
        const supplierProductService = new ItemsService("supplier_products", { schema });
        const stockService = new ItemsService("stock", { schema });
    
        const processedItems = [];
    
        for (const scan of scans) {
            // Find the corresponding supplier product
            const [supplierProduct] = await supplierProductService.readByQuery({
                filter: {
                    _and: [
                        { supplier },
                        { product: scan.product_id }
                    ]
                }
            });
    
            // if (!supplierProduct) {
            //     console.warn(`Supplier product not found for scan: ${JSON.stringify(scan)}`);
            //     continue;
            // }
    
            // Get current stock data
            const [currentStockData] = await stockService.readByQuery({
                filter: {
                    _and: [
                        { warehouse },
                        { product: scan.product_id }
                    ]
                }
            });
    
            // Prepare the item data
            const itemData = {
                product: supplierProduct.id,
                [targetField]: context.targetId,
                quantity: scan.quantity,
                unit_price: scan.unit_price,
                full_price: (scan.unit_price * scan.quantity).toFixed(2),
                available: currentStockData?.available_quantity || 0,
                available_in_other_stocks: scan.rest_available,
                ordered: currentStockData?.ordered_quantity || 0,
                reserved: currentStockData?.reserved_quantity || 0,
                onhand: currentStockData?.onhand_quantity || 0
            };
    
            // Create the item using the provided service
            const createdItem = await targetService.createOne(itemData);
            processedItems.push(createdItem);
        }
    
        return processedItems;
}

static async processBarcodeMine(ItemsService,key,input,schema,type){
 
    let replenishmentTable;
    let replenishmentProductsTable;
    switch (type) {
        case "replenishment":
            replenishmentTable = "stock_replenishment";
            replenishmentProductsTable = "stock_replenishment_products";
            break;
        case "purchase":
            replenishmentTable = "purchase";
            replenishmentProductsTable = "purchase_products";
            break;
        default:                    
            break;
    }

    let replenishmentTypeService = new ItemsService(replenishmentTable,{schema});
    let replenishmentTypeProductService = new ItemsService(replenishmentProductsTable,{schema});
    let stockService = new ItemsService("stock",{schema});
    let currentItem = await replenishmentTypeService.readOne(key,{fields:["*"]});
    let warehouse = currentItem.warehouse;
    let supplier = currentItem.supplier;
    console.log("BARCODE UTIL")
    console.log(currentItem)
    let supplierProductService = new ItemsService("supplier_products",{schema});
    let scans = input.barcode_scanner;
   
        for(let i = 0 ; i<scans.length; i++){
            let scan = scans[i];
            // let supplierProduct = await supplierProductService.readByQuery({filter:{
            //     _and:[
            //         {supplier:supplier},
            //         {product:scan.product_id}
            //     ]
            // }})
            await replenishmentTypeProductService.createOne({
                product:scan.product_id,
                purchase:key,
                stock_replenishment:key,
                quantity:scan.quantity,
                unit_price:scan.unit_price,
                full_price:(scan.unit_price*scan.quantity).toFixed(2),
                available:scan.available,
                available_in_other_stocks:scan.rest_available,
                ordered:scan.ordered,
                reserved:scan.reserved,
                onhand:scan.onhand
            })
        }
        input.barcode_scanner = [];
    
    if(input.purchase_products && input.purchase_products.create.length > 0){
        let creates = input.purchase_products.create;
        for(let i = 0; i<creates.length;i++){
            let create = creates[i];
            
            let currentStockData = await stockService.readByQuery({filter:{
                _and:[
                    {warehouse:warehouse},
                    {product:create.product}]
            }})
            let stockData = await stockService.readByQuery({filter:{product:create.product}});
            let restAvailable = 0 ;
            let currentAvailable = 0;
            let currentOnhand = 0 ;
            let currentReserved = 0;
            let currentOrdered = 0;
            for(let x = 0; x<stockData.length; i++){
                let available = stockData[i].available_quantity;
                restAvailable = restAvailable + available;
            }
            if(currentStockData.length>0){
                restAvailable = restAvailable - currentStockData[0].available_quantity;
                currentAvailable = currentStockData[0].available_quantity;
                currentOnhand = currentStockData[0].onhand_quanitity;
                currentReserved = currentStockData[0].reserved_quantity;
                currentOrdered = currentStockData[0].ordered_quantity;
            }
            input.purchase_products.create[i] = {
                product:create.product,
                purchase:create.purchase,
                quantity:create.quantity,
                unit_price:create.unit_price,
                full_price:(create.unit_price*create.quantity).toFixed(2),
                available:currentAvailable,
                available_in_onther_stocks:restAvailable,
                onhand:currentOnhand,
                ordered:currentOrdered,
                reserved:currentReserved
            }

        }
        
    }
    return input;
}
}
export default BarcodeUtil;