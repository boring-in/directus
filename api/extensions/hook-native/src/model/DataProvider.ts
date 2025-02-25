import { Knex } from "knex";
import Constants from "../const/Constants";

interface EnvValues {
    transfer_default_calculation_type: number;
    transfer_calculations_timespan: number;
    transfer_calculations_order_count: number;
    transfer_calculations_buffer: number;
    transfer_calculations_moq: number;
}

interface DatabaseResponse {
    rows?: any[];
    [key: string]: any;
}

interface WarehouseProduct {
    product_calculation_type: number;
    warehouse_calculation_type: number;
}

interface StockData {
    available_quantity: number;
}

interface OrderProduct {
    available_quantity: number;
    quantity: number;
}

interface ArrivingProduct {
    warehouse: number;
    product: number;
    arriving_quantity: number;
}

interface TransferStatus {
    transferStatus: number;
}

interface WarehouseHierarchyResult {
    hierarchy: Map<number, Map<number, any>>;
    warehouses: number[];
}

interface TimestampData {
    last_timestamp: string;
}

/**
 * DataProvider class for handling database operations and data retrieval
 */
class DataProvider {
    private _database: Knex;
    private _context?: any;

    constructor(database: Knex) {
        this._database = database;
    }

   async getProductAttributesJson(product: number): Promise<any> {
        const query = `select attributes from product where product_id = ${product}`;
        const databaseData = await this._database.raw(query);
        return this.scrubData(databaseData);
    
   }

    /**
     * Get environment values with default calculations
     */
    async getEnvValues(): Promise<EnvValues> {
        return {
            transfer_default_calculation_type: Constants.defaultCalculationType,
            transfer_calculations_timespan: Constants.defaultCalculationTimespan,
            transfer_calculations_order_count: Constants.defaultCalculationOrderCount,
            transfer_calculations_buffer: Constants.defaultCalculationBuffer,
            transfer_calculations_moq: Constants.defaultCalculationMoq,
        };
    }

    /**
     * Get stock replenishment products stock
     */
    async getStockReplenishmentProductsStock(replenishmentId: number): Promise<any[]> {
        const query = ` select s.id as stock,(s.onhand_quantity + srp.quantity) as onhand from stock_replenishment_products srp
            left join stock_replenishment sr on sr.id = srp.stock_replenishment 
            left join stock s on s.warehouse = sr.warehouse and s.product = srp.product 
            where sr.id = ${replenishmentId};`;
        const databaseData = await this._database.raw(query);
        return this.scrubData(databaseData);
    }

    /**
     * Get last transfer status
     */
    async getLastTransferStatus(transferId: number): Promise<number | null> {
        const query = `SELECT * from transfer_status_history where transfer = ${transferId} order by id desc limit 1`;
        const databaseData = await this._database.raw(query);
        const transferStatus: TransferStatus[] = this.scrubData(databaseData);

        if (transferStatus && transferStatus.length > 0 && transferStatus[0]) {
            return transferStatus[0].transferStatus;
        }
        return null;
    }

    /**
     * Get stock transfer products
     */
    async getStockTransferProducts(transferId: number): Promise<any[]> {
        const query = `SELECT product, transfer_quantity from stock_transfer_products where stock_transfer = ${transferId}`;
        const databaseData = await this._database.raw(query);
        return this.scrubData(databaseData);
    }

    /**
     * Get supplier products for given product id
     */

    async getProductSuppliers(product: number): Promise<any[]> {
        const query = `SELECT * from supplier_products where product = ${product}`;
        const databaseData = await this._database.raw(query);
        return this.scrubData(databaseData);
    }

    /**
     * Check if order has sufficient stock
     */
    async checkOrderStock(orderId: number): Promise<boolean> {
        const query = `SELECT * from orders o 
            left join order_products op on op.order = o.id 
            left join stock s on s.warehouse = op.warehouse AND s.product = op.product 
            where o.id = ${orderId}`;
        const databaseData = await this._database.raw(query);
        const orderProducts: OrderProduct[] = this.scrubData(databaseData);

        return orderProducts.every(product => 
            (product.available_quantity ?? 0) >= (product.quantity ?? 0)
        );
    }

    /**
     * Get warehouse product calculation type
     */
    async getWarehouseProductCalculationType(product: number, warehouse: number): Promise<number> {
        const query = `SELECT wp.product_calculation_type, w.product_calculation_type as warehouse_calculation_type 
            from warehouse_products wp 
            left join warehouse w on w.id = wp.warehouse 
            where wp.product = ${product} AND wp.warehouse = ${warehouse}`;
        const databaseData = await this._database.raw(query);
        const warehouseProduct: WarehouseProduct[] = this.scrubData(databaseData);

        let calculationType = Constants.defaultCalculationType;
        if (warehouseProduct && warehouseProduct.length > 0 && warehouseProduct[0]) {
            if (warehouseProduct[0].product_calculation_type > 0) {
                calculationType = warehouseProduct[0].product_calculation_type;
            } else if (warehouseProduct[0].warehouse_calculation_type > 0) {
                calculationType = warehouseProduct[0].warehouse_calculation_type;
            }
        }

        return calculationType;
    }

    /**
     * Get order product sufficiency
     */
    async getOrderProductSufficiency(product: number, warehouse: number, quantity: number): Promise<number> {
        const query = `select s.* from stock s where s.warehouse = ${warehouse} AND s.product = ${product};`;
        const databaseData = await this._database.raw(query);
        const stockData: StockData[] = this.scrubData(databaseData);

        let sufficiencyFlag = 0;
        if (stockData && stockData.length > 0 && stockData[0]) {
            const availableQuantity = stockData[0].available_quantity ?? 0;
            if (availableQuantity >= quantity) {
                sufficiencyFlag = 1;
            } else if (availableQuantity > 0 && availableQuantity < quantity) {
                sufficiencyFlag = 2;
            }
        }
        return sufficiencyFlag;
    }

    /**
     * Get product calculation type
     */
    async getProductCalculationType(product: number, warehouse: number): Promise<number> {
        if(warehouse!=undefined){
            const query = `SELECT product_calculation_type FROM warehouse_products WHERE product = ${product} AND warehouse = ${warehouse}`;
            const databaseData = await this._database.raw(query);
            const data = this.scrubData(databaseData);
            
            if (data && data.length > 0 && data[0] && data[0].productCalculationType !== undefined) {
                return data[0].productCalculationType;
            }
        }
        
        return 1;
    }

    /**
     * Get arriving products
     */
    async getArrivingProducts(warehouseHierarchy: string): Promise<Map<string, ArrivingProduct>> {
        const query = `SELECT product, warehouse, SUM(arriving_quantity) as arriving_quantity
            FROM (
                (SELECT 
                    pp.quantity as arriving_quantity,
                    sp.product as product,
                    p.warehouse as warehouse
                from purchase p
                inner join purchase_products pp on pp.purchase = p.id 
                inner join supplier_products sp on sp.id = pp.product
                where p.warehouse in (${warehouseHierarchy}) and p.status = 1)
                UNION 
                (select stp.transfer_quantity as arriving_quantity,
                    wp.product as product,
                    st.warehouse_receiving as warehouse 
                from stock_transfer st 
                inner join stock_transfer_products stp on stp.stock_transfer = st.id
                inner join warehouse_products wp on wp.id = stp.product
                where st.status = 1 and st.warehouse_receiving in (${warehouseHierarchy}))
            ) as sub
            group by product, warehouse;`;

        const databaseData = await this._database.raw(query);
        const arrivingProducts: ArrivingProduct[] = this.scrubData(databaseData);

        const arrivingProductsMap = new Map<string, ArrivingProduct>();
        if (arrivingProducts) {
            arrivingProducts.forEach((element) => {
                if (element && element.warehouse && element.product) {
                    arrivingProductsMap.set(`${element.warehouse}_${element.product}`, element);
                }
            });
        }

        return arrivingProductsMap;
    }

    /**
     * Get warehouse hierarchy
     */
    async getWarehouseHierarchy(warehouseId: number): Promise<WarehouseHierarchyResult> {
        const query = `select DISTINCT parent_warehouse, child_warehouse from warehouse_relation wr where parent_warehouse is not null;`;
        const databaseData = await this._database.raw(query);
        const data = this.scrubData(databaseData);

        const topHierarchy = new Map<number, Map<number, any>>();
        const allWarehouses: number[] = [];

        function buildHierarchy(data: any[], parentId: number): Map<number, any> {
            const hierarchy = new Map<number, any>();
            const children = data.filter(item => item && item.parent_warehouse == parentId);
            children.forEach(child => {
                if (child && child.child_warehouse) {
                    allWarehouses.push(child.child_warehouse);
                    hierarchy.set(
                        Number(child.child_warehouse), 
                        buildHierarchy(data, Number(child.child_warehouse))
                    );
                }
            });
            return hierarchy;
        }

        topHierarchy.set(Number(warehouseId), buildHierarchy(data, Number(warehouseId)));
        return { hierarchy: topHierarchy, warehouses: allWarehouses };
    }

    /**
     * Get last timestamp
     */
    async getLastTimestamp(product: number, warehouse: number): Promise<TimestampData | null> {
        if(warehouse!=undefined){
            const data = await this._database.raw(
                'select last_timestamp from product_timestamps where product = ' + product + 
                ' and warehouse = ' + warehouse + ' order by id desc;'
            );
            const timestamp = this.scrubData(data);
            return timestamp && timestamp.length > 0 ? timestamp[0] : null;
        }
        return null;
    }

    /**
     * Check if product is sold out
     */
    async isSoldOut(product: number, warehouse: number): Promise<boolean> {
        const dbData = await this._database.raw(
            'select available_quantity from stock where product = ' + product + 
            ' and warehouse = ' + warehouse + ';'
        );
        const data = this.scrubData(dbData);

        if (data && data.length > 0 && data[0] && typeof data[0].available_quantity === 'number') {
            return data[0].available_quantity <= 0;
        }
        return true;
    }

    /**
     * Scrub database response data
     */
    private scrubData(data: DatabaseResponse): any[] {
        if (!data) return [];
        return data.rows == null || data.rows == undefined
            ? this.mariaDbToJSON(data)
            : data.rows;
    }

    /**
     * Convert MariaDB response to JSON
     */
    private mariaDbToJSON(data: DatabaseResponse): any[] {
        const dataArray: any[] = [];
        if (data !== undefined && data[0]) {
            const rows = data[0];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row) {
                    try {
                        const jsonString = JSON.stringify(row);
                        const jsonObject = JSON.parse(jsonString);
                        dataArray.push(jsonObject);
                    } catch (error) {
                        console.error('Error parsing row:', error);
                    }
                }
            }
        }
        return dataArray;
    }
}

export default DataProvider;
