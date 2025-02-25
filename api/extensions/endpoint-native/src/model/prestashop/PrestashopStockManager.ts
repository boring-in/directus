/**
 * Interface for the context object passed to PrestashopStockManager
 */
interface Context {
    getSchema: () => Promise<any>;
    services: {
        ItemsService: new (collection: string, options: { schema: any }) => ItemsService;
    };
}

/**
 * Interface for the ItemsService class
 */
interface ItemsService {
    createOne: (data: any) => Promise<any>;
    readByQuery: (query: any) => Promise<any[]>;
}

/**
 * Interface for stock data structure
 */
interface StockData {
    product: string | number;
    warehouse: string | number;
    onhand_quantity: number;
}

/**
 * Manages stock operations in Prestashop
 */
export class PrestashopStockManager {
    private context: Context;
    private getSchema: () => Promise<any>;
    private services: Context['services'];
    private ItemsService: Context['services']['ItemsService'];

    /**
     * Creates an instance of PrestashopStockManager
     * @param context - The context object containing necessary services and schema
     */
    constructor(context: Context) {
        this.context = context;
        this.getSchema = context.getSchema;
        this.services = context.services;
        this.ItemsService = this.services.ItemsService;
    }

    /**
     * Creates a new stock entry for a product in a warehouse
     * @param productId - The ID of the product
     * @param warehouse - The warehouse identifier
     * @returns Promise resolving to the created stock entry
     */
    async createStock(productId: string | number, warehouse: string | number): Promise<any> {
        const schema = await this.getSchema();
        const stockService = new this.ItemsService("stock", { schema });
        const stock = await stockService.createOne({
            product: productId,
            warehouse: warehouse,
            onhand_quantity: 100
        } as StockData);
        return stock;
    }

    /**
     * Checks if stock exists for a product in a warehouse, creates it if not
     * @param productId - The ID of the product
     * @param warehouse - The warehouse identifier
     */
    async checkStock(productId: string | number, warehouse: string | number): Promise<void> {
        const schema = await this.getSchema();
        const stockService = new this.ItemsService("stock", { schema });
        
        const productStock = await stockService.readByQuery({
            filter: {
                _and: [
                    { warehouse: { _eq: warehouse } },
                    { product: { _eq: productId } }
                ]
            }
        });

        if (productStock.length === 0) {
            await stockService.createOne({
                product: productId,
                warehouse: warehouse,
                onhand_quantity: 100
            } as StockData);
        }
    }
}
