import mysql from 'mysql';
import Constants from '../../const/Constants';
import Product from '../../class/Product';
import ExternalDataProvider from '../../class/ExternalDataProvider';

/**
 * Interface for the context object passed to StockTakingSync
 */
interface Context {
    services: {
        ItemsService: new (collection: string, options: { schema: any }) => ItemsService;
    };
    getSchema: () => Promise<any>;
}

/**
 * Interface for the ItemsService class
 */
interface ItemsService {
    readByQuery(query: any): Promise<any[]>;
    createOne(data: any): Promise<any>;
    updateOne(id: number, data: any): Promise<any>;
}

/**
 * Interface for stock taking data
 */
interface StockTaking {
    date_add: string;
    id_warehouse?: number;
    id_product?: number;
    id_product_attribute?: number;
    quantity?: number;
}

/**
 * Class responsible for synchronizing stock taking data between systems
 */
class StockTakingSync {
    private _context: Context;
    private _getSchema: () => Promise<any>;

    constructor(context: Context) {
        this._context = context;
        this._getSchema = this._context.getSchema;
    }

    /**
     * Synchronizes stock taking data between systems
     */
    async sync(): Promise<void> {
        // Get latest stock taking from directus
        const { ItemsService } = this._context.services;
        const schema = await this._getSchema();
        const stockTakingService = new ItemsService("stock_taking", { schema: schema });
        const stockTakingProductsService = new ItemsService("stock_taking_product", { schema: schema });
        const salesChannelProductService = new ItemsService("sales_channel_products", { schema: schema });
        const stockService = new ItemsService("stock", { schema: schema });
        
        let stockTakings: StockTaking[] = [];
        stockTakings = await stockTakingService.readByQuery({
            filter: { is_imported: { _eq: true } },
            sort: ['-id'],
            limit: 1
        });

        if (stockTakings.length === 0) {
            const json: StockTaking = { date_add: this.getCurrentFormattedDate() };
            stockTakings.push(json);
        }

        // Fetch new stock takings from PrestaShop
        const externalDataProvider = new ExternalDataProvider(
            Constants.psHost,
            Constants.psPort,
            Constants.psPassword,
            Constants.psUser,
            Constants.psDatabase
        );

        const newStockTakings = await externalDataProvider.getStockTakings(stockTakings[0].date_add);

        for (const stockTaking of newStockTakings) {
            const localWarehouseId = Constants.getPsWarehouseId(stockTaking.id_warehouse);
            
            const newStockTaking = await stockTakingService.createOne({
                is_imported: true,
                warehouse: localWarehouseId,
                read_only_flag: true,
                date_add: stockTaking.date_add
            });

            const currentStock = await externalDataProvider.getCurrentStock(
                stockTaking.id_warehouse,
                stockTaking.id_product,
                stockTaking.id_product_attribute
            );

            console.log("currentStock: ");
            console.log(currentStock);

            // Find local product 
            const externalId = `${stockTaking.id_product}_${stockTaking.id_product_attribute}`;
            const localProduct = await salesChannelProductService.readByQuery({
                filter: { sales_channel_product_id: { _eq: externalId } }
            });

            if (localProduct.length === 0) {
                continue;
            }

            await stockTakingProductsService.createOne({
                stock_taking: newStockTaking,
                product: localProduct[0].product,
                quantity: stockTaking.quantity,
                is_imported: true
            });

            const stock = await stockService.readByQuery({
                filter: {
                    warehouse: { _eq: localWarehouseId },
                    product: { _eq: localProduct[0].product }
                }
            });

            if (stock.length === 0) {
                await stockService.createOne({
                    warehouse: localWarehouseId,
                    product: localProduct[0].product,
                    onhand_quantity: currentStock
                });
            } else {
                await stockService.updateOne(stock[0].id, {
                    onhand_quantity: currentStock
                });
            }
        }

        externalDataProvider.endConnection();
    }

    /**
     * Gets the current date formatted as YYYY-MM-DD 01:00:00.0
     * @returns {string} Formatted date string
     */
    private getCurrentFormattedDate(): string {
        const date = new Date();
    
        // Get individual date components
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
        const day = String(date.getDate()).padStart(2, '0');
    
        // Construct formatted date
        return `${year}-${month}-${day} 01:00:00.0`;
    }
}

export default StockTakingSync;
