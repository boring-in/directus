import mysql from 'mysql';
import Constants from '../../const/Constants';
import Product from '../../class/Product';
import ExternalDataProvider from '../../class/ExternalDataProvider';

/**
 * Interface for the context object passed to StockTransferSync
 */
interface Context {
    services: {
        ItemsService: any; // Using any since the actual type is not provided
    };
    getSchema: () => Promise<any>;
}

/**
 * Interface for PrestaShop transfer object
 */
interface PrestaShopTransfer {
    id_warehouse_transfer: number;
    id_warehouse_transfer_state: number;
    id_warehouse_from: number;
    id_warehouse_to: number;
    date_upd: string;
    date_add: string;
}

/**
 * Interface for PrestaShop transfer product
 */
interface TransferProduct {
    id_warehouse_transfer: number;
    id_product: number;
    id_product_attribute: number;
    quantity: number;
}

/**
 * Class responsible for synchronizing warehouse transfers between PrestaShop and Directus
 */
class StockTransferSync {
    private _context: Context;
    private _getSchema: () => Promise<any>;

    constructor(context: Context) {
        this._context = context;
        this._getSchema = this._context.getSchema;
    }

    /**
     * Synchronizes warehouse transfers from PrestaShop to Directus
     */
    async syncWarehouseTransfers(): Promise<void> {
        let con: mysql.Connection;
        
        con = mysql.createConnection({
            host: Constants.psHost,
            port: Constants.psPort,
            user: Constants.psUser,
            password: Constants.psPassword,
            database: Constants.psDatabase
        });

        const { ItemsService } = this._context.services;
        const schema = await this._getSchema();
        const stockTransferService = new ItemsService("stock_transfer", { schema: schema });
        const stockTransferProductsService = new ItemsService("stock_transfer_products", { schema: schema });
        const warehouseService = new ItemsService("warehouse", { schema: schema });
        const stockService = new ItemsService("stock", { schema: schema });
        const transferLogService = new ItemsService("transfer_log", { schema: schema });

        try {
            // Fetch the latest transfer from Directus
            let latestTransfer: Array<any> = [];
            latestTransfer = await stockTransferService.readByQuery({
                sort: ['-id'],
                limit: 1
            });

            if (latestTransfer.length == 0) {
                const json = { date_add: '2024-09-10' };
                latestTransfer.push(json);
            }
            const lastSyncDate = latestTransfer[0].date_add;

            // Fetch new transfers from PrestaShop
            const newTransfers: PrestaShopTransfer[] = await new Promise((resolve, reject) => {
                con.query(`
                    SELECT wt.* from cos_warehouse_transfer wt
                    WHERE wt.date_add > ?
                    ORDER BY wt.date_add ASC
                `, [lastSyncDate], (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                });
            });

            // Status mapping between PrestaShop and Directus
            const statusMap: { [key: number]: number } = {
                1: 2, // draft
                2: 4, // shipped (assuming 'in_transit' in PrestaShop means 'shipped' in Directus)
                3: 5, // received
                4: 7  // cancelled
            };

            const warehouseMap: { [key: number]: number } = {
                5: 1,
                6: 2,
                7: 3,
            };

            for (const transfer of newTransfers) {
                // Create new transfer in Directus
                const newDirectusTransfer = await stockTransferService.createOne({
                    warehouse: warehouseMap[transfer.id_warehouse_from],
                    warehouse_receiving: warehouseMap[transfer.id_warehouse_to],
                    transfer_status: statusMap[transfer.id_warehouse_transfer_state] || 0,
                    last_updated_on: transfer.date_upd,
                    date_add: transfer.date_add
                });

                // Fetch and create transfer products
                const transferProducts: TransferProduct[] = await new Promise((resolve, reject) => {
                    con.query(`
                        SELECT * FROM cos_warehouse_transfer_detail
                        WHERE id_warehouse_transfer = ?
                    `, [transfer.id_warehouse_transfer], (error, results) => {
                        if (error) reject(error);
                        else resolve(results);
                    });
                });

                for (const product of transferProducts) {
                    const directusProduct = await this.mapPrestaShopProductToDirectus(
                        product.id_product,
                        product.id_product_attribute
                    );

                    await stockTransferProductsService.createOne({
                        stock_transfer: Number(newDirectusTransfer),
                        product: directusProduct,
                        transfer_quantity: product.quantity
                    });
                }
            }

            con.end();
            console.log("Warehouse transfer sync completed");
            await transferLogService.createOne({ message: "Warehouse transfer sync completed successfully" });
        } catch (error: any) {
            await transferLogService.createOne({ message: error.message });
            throw error;
        }
    }

    /**
     * Maps PrestaShop product IDs to Directus product IDs
     * @param prestaShopProductId - The PrestaShop product ID
     * @param prestaShopProductAttributeId - The PrestaShop product attribute ID
     * @returns Promise resolving to the Directus product ID
     */
    async mapPrestaShopProductToDirectus(
        prestaShopProductId: number,
        prestaShopProductAttributeId: number
    ): Promise<number> {
        const { ItemsService } = this._context.services;
        const schema = await this._getSchema();
        const productHelper = new Product(ItemsService, schema);
        const salesChannelProductService = new ItemsService("sales_channel_products", { schema: schema });
        let fullProductId: string;

        if (prestaShopProductAttributeId != 0) {
            fullProductId = `${prestaShopProductId}_${prestaShopProductAttributeId}`;
        } else {
            fullProductId = String(prestaShopProductId);
        }

        const salesChannelProduct = await salesChannelProductService.readByQuery({
            filter: { sales_channel_product_id: fullProductId }
        });

        if (salesChannelProduct.length > 0) {
            return salesChannelProduct[0].product;
        } else {
            const externalDataProvider = new ExternalDataProvider(
                Constants.psHost,
                Constants.psPort,
                Constants.psPassword,
                Constants.psUser,
                Constants.psDatabase
            );

            const productDataResponse = await externalDataProvider.getPrestashopProduct(
                prestaShopProductId,
                prestaShopProductAttributeId
            );
            const productData = productDataResponse[0];

            if (productData.hasOwnProperty('sku')) {
                const product = await productHelper.getProductBySku(productData);
                return product.product_id;
            } else {
                const product = await productHelper.getProductBySku(productData);
                return product.product_id;
            }
        }
    }
}

export default StockTransferSync;
