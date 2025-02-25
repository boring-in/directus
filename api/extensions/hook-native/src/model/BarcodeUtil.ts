/**
 * Interface for barcode scan data
 */
interface BarcodeScanner {
    product_id: string;
    quantity: number;
    unit_price: number;
    available: number;
    rest_available: number;
    ordered: number;
    reserved: number;
    onhand: number;
}

/**
 * Interface for context object used in processBarcodes
 */
interface ProcessContext {
    schema: unknown;
    targetService: any; // Using any for now as we don't have access to Directus types
    targetField: string;
    supplier: string;
    warehouse: string;
    targetId: string;
}

/**
 * Interface for stock data
 */
interface StockData {
    available_quantity?: number;
    ordered_quantity?: number;
    reserved_quantity?: number;
    onhand_quantity?: number;
}

/**
 * Interface for supplier product
 */
interface SupplierProduct {
    id: string;
    supplier: string;
    product: string;
}

/**
 * Interface for purchase products create input
 */
interface PurchaseProductCreate {
    product: string;
    purchase: string;
    quantity: number;
    unit_price: number;
    full_price?: string;
    available?: number;
    available_in_onther_stocks?: number;
    onhand?: number;
    ordered?: number;
    reserved?: number;
}

/**
 * Interface for barcode process input
 */
interface BarcodeProcessInput {
    barcode_scanner: BarcodeScanner[];
    purchase_products?: {
        create: PurchaseProductCreate[];
    };
}

/**
 * Utility class for processing barcodes and managing stock-related operations
 */
class BarcodeUtil {
    /**
     * Process barcode scans and create corresponding items
     * @param scans Array of barcode scan data
     * @param context Processing context with service and filter information
     * @returns Array of processed items
     */
    static async processBarcodes(scans: BarcodeScanner[], context: ProcessContext): Promise<unknown[]> {
        const { schema, targetService, targetField, supplier, warehouse } = context;
        const supplierProductService = new (globalThis as any).ItemsService("supplier_products", { schema });
        const stockService = new (globalThis as any).ItemsService("stock", { schema });
    
        const processedItems: unknown[] = [];
    
        for (const scan of scans) {
            // Find the corresponding supplier product
            const [supplierProduct] = await supplierProductService.readByQuery({
                filter: {
                    _and: [
                        { supplier },
                        { product: scan.product_id }
                    ]
                }
            }) as SupplierProduct[];
    
            if (!supplierProduct) {
                continue;
            }
    
            // Get current stock data
            const [currentStockData] = await stockService.readByQuery({
                filter: {
                    _and: [
                        { warehouse },
                        { product: scan.product_id }
                    ]
                }
            }) as StockData[];
    
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

    /**
     * Process barcode data for replenishment or purchase operations
     * @param ItemsServiceClass Service class for database operations
     * @param key Key identifier for the operation
     * @param input Input data containing barcode scanner information
     * @param schema Database schema
     * @param type Type of operation ('replenishment' or 'purchase')
     * @returns Processed input data
     */
    static async processBarcodeMine(
        ItemsServiceClass: any,
        key: string,
        input: BarcodeProcessInput,
        schema: unknown,
        type: 'replenishment' | 'purchase' | 'taking' | 'transfer'
    ): Promise<BarcodeProcessInput> {
        let replenishmentTable = '';
        let replenishmentProductsTable = '';
        
        switch (type) {
            case "replenishment":
                replenishmentTable = "stock_replenishment";
                replenishmentProductsTable = "stock_replenishment_products";
                break;
            case "purchase":
                replenishmentTable = "purchase";
                replenishmentProductsTable = "purchase_products";
                break;
            case "taking":
                replenishmentTable = "stock_taking";
                replenishmentProductsTable = "stock_taking_product";
                break;
            case "transfer":
                replenishmentTable = "stock_transfer";
                replenishmentProductsTable = "stock_transfer_products";
                break;
            default:
                throw new Error(`Invalid type: ${type}`);
        }

        const replenishmentTypeService = new ItemsServiceClass(replenishmentTable, { schema });
        const replenishmentTypeProductService = new ItemsServiceClass(replenishmentProductsTable, { schema });
        const stockService = new ItemsServiceClass("stock", { schema });
        const currentItem = await replenishmentTypeService.readOne(key, { fields: ["*"] });
        const warehouse = currentItem.warehouse;
        const supplier = currentItem.supplier;
        
        console.log("BARCODE UTIL");
        console.log(currentItem);
        
        const scans = input.barcode_scanner;
   
        for (const scan of scans) {
            if( type === 'replenishment' ) {
                await replenishmentTypeProductService.createOne({
                    product: scan.product_id,
                    purchase: key,
                    stock_replenishment: key,
                    quantity: scan.quantity,
                    unit_price: scan.unit_price,
                    full_price: (scan.unit_price * scan.quantity).toFixed(2),
                    available: scan.available,
                    available_in_other_stocks: scan.rest_available,
                    ordered: scan.ordered,
                    reserved: scan.reserved,
                    onhand: scan.onhand
                });
            };
            if( type === 'purchase' ) {
                await replenishmentTypeProductService.createOne({
                    product: scan.product_id,
                    purchase: key,
                    quantity: scan.quantity,
                    unit_price: scan.unit_price,
                    full_price: (scan.unit_price * scan.quantity).toFixed(2),
                    available: scan.available,
                    available_in_other_stocks: scan.rest_available,
                    ordered: scan.ordered,
                    reserved: scan.reserved,
                    onhand: scan.onhand
                });
            };
            if( type === 'taking' ) {
                await replenishmentTypeProductService.createOne({
                    product: scan.product_id,
                    stock_taking: key,
                    quantity: scan.units,
                });
            };
            if( type === 'transfer' ) {
                await replenishmentTypeProductService.createOne({
                    product: scan.product_id,
                    stock_transfer: key,
                    quantity: scan.quantity,
                });
            };
        }
        input.barcode_scanner = [];
    
        const purchaseProducts = input.purchase_products?.create;
        if (purchaseProducts && purchaseProducts.length > 0) {
            for (let i = 0; i < purchaseProducts.length; i++) {
                const createItem = purchaseProducts[i];
                if (!createItem) continue;
                
                const [currentStockData] = await stockService.readByQuery({
                    filter: {
                        _and: [
                            { warehouse },
                            { product: createItem.product }
                        ]
                    }
                }) as StockData[];

                const stockData = await stockService.readByQuery({
                    filter: { product: createItem.product }
                }) as StockData[];

                let restAvailable = 0;
                let currentAvailable = 0;
                let currentOnhand = 0;
                let currentReserved = 0;
                let currentOrdered = 0;

                for (let x = 0; x < stockData.length; x++) {
                    const stockItem = stockData[x];
                    if (stockItem) {
                        const available = stockItem.available_quantity || 0;
                        restAvailable += available;
                    }
                }

                if (currentStockData) {
                    restAvailable = restAvailable - (currentStockData.available_quantity || 0);
                    currentAvailable = currentStockData.available_quantity || 0;
                    currentOnhand = currentStockData.onhand_quantity || 0;
                    currentReserved = currentStockData.reserved_quantity || 0;
                    currentOrdered = currentStockData.ordered_quantity || 0;
                }

                const updatedItem: PurchaseProductCreate = {
                    product: createItem.product,
                    purchase: createItem.purchase,
                    quantity: createItem.quantity,
                    unit_price: createItem.unit_price,
                    full_price: (createItem.unit_price * createItem.quantity).toFixed(2),
                    available: currentAvailable,
                    available_in_onther_stocks: restAvailable,
                    onhand: currentOnhand,
                    ordered: currentOrdered,
                    reserved: currentReserved
                };

                if (input.purchase_products?.create) {
                    input.purchase_products.create[i] = updatedItem;
                }
            }
        }
        return input;
    }
}

export default BarcodeUtil;
