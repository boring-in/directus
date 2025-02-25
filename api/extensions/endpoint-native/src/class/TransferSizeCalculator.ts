import DataProvider from "./DataProvider";
import DataWriter from "./DataWriter";
import Warehouse from "./Warehouse";
import Constants from "../const/Constants";

import ProductsForecast from "./ProductsForecast";

interface Context {
    services: {
        ItemsService: new (name: string, options: { schema: any }) => ItemsService;
    };
    getSchema: () => Promise<any>;
}

interface ItemsService {
    readOne: (id: number) => Promise<StockTransferData>;
}

interface StockTransferData {
    warehouse: number;
    warehouse_receiving: number;
}

interface ArrivingProduct {
    product_id: number;
    product: number;
    arrival_date: string;
    arriving_quantity: number;
}

interface WarehouseHierarchyData {
    hierarchy: any;
    warehouses: number[] | null;
}

interface PeriodItem {
    analysed_period: number | null;
}

interface ProductData {
    product_id: number;
    total_variant_order_quantity: number;
    first_order_arrival_days: number;
}

interface EnvValues {
    transfer_calculations_moq: number;
    transfer_calculations_timespan: number;
    transfer_calculations_order_count: number;
    transfer_calculations_buffer: number;
}

/**
 * Calculator class for determining transfer sizes between warehouses
 */
class TransferSizeCalculator {
    /**
     * Calculates and forms transfer data for stock transfers between warehouses
     * @param stockTransferId - The ID of the stock transfer
     * @param context - The context object containing services and schema
     * @returns Promise resolving to the stock transfer ID
     */
    async formCalculation(stockTransferId: number, context: Context): Promise<number> {
        const dataProvider = new DataProvider(context);
        const dataWriter = new DataWriter(context);
        const { ItemsService } = context.services;
        const schema = await context.getSchema();
        const stockTransferService = new ItemsService('stock_transfer', { schema: schema });
        
        // Fetch the existing stock transfer data
        const stockTransferData = await stockTransferService.readOne(stockTransferId);
        const warehouseSrc = stockTransferData.warehouse;
        const warehouseDst = stockTransferData.warehouse_receiving;
        const arrivingProducts = await dataProvider.getArrivingProducts(warehouseDst);
        const currentDate = new Date(); // Moved here from arrivingProductsInit
        const arrivingProductsMap = this.arrivingProductsInit(arrivingProducts, currentDate);
        
        const envValues: EnvValues = {
            transfer_calculations_moq: Constants.defaultCalculationMoq,
            transfer_calculations_timespan: Constants.defaultCalculationTimespan,
            transfer_calculations_order_count: Constants.defaultCalculationOrderCount,
            transfer_calculations_buffer: Constants.defaultCalculationBuffer
        };

        const parentWarehouse = new Warehouse(warehouseSrc);
        await parentWarehouse.load(context);

        const warehouseHierarchyData = await dataProvider.getWarehouseHierarchy(warehouseDst);
        
        const warehouseHierarchy = warehouseHierarchyData.hierarchy;
        let allWarehouses = warehouseHierarchyData.warehouses;
        if (allWarehouses == null || allWarehouses.length == 0) {
            allWarehouses = [warehouseDst];
        }

        const periodData = await dataProvider.getAnalyzedPeriods(warehouseDst);
        const productsForecast = new ProductsForecast(warehouseHierarchy, arrivingProductsMap, context);
        
        const warehouseProductsArrays: any[] = [];
        let warehouseMap = new Map();

        for (const periodItem of periodData) {
            const period = periodItem.analysed_period == null
                ? envValues.transfer_calculations_timespan
                : periodItem.analysed_period;

            const useEnv = periodItem.analysed_period == null;

            const data = await dataProvider.getWarehouseProducts(
                warehouseSrc,
                warehouseDst,
                allWarehouses,
                period,
                true,
                useEnv
            );
            warehouseProductsArrays.push(data);
            await productsForecast.loadData(data);
        }

        warehouseMap = await productsForecast.execute();
        const purchaseData = warehouseMap.get(warehouseDst).purchaseData;

        for (const product of purchaseData) {
            for (const data of product) {
                if (data.total_variant_order_quantity > 0) {
                    const arrivalDate = new Date(currentDate);
                    arrivalDate.setDate(currentDate.getDate() + data.first_order_arrival_days);
                    await dataWriter.writeData("stock_transfer_products", {
                        stock_transfer: stockTransferId,
                        product: data.product_id,
                        transfer_quantity: data.total_variant_order_quantity,
                        arrival_date: arrivalDate,
                    });
                }
            }
        }

        return stockTransferId;
    }

    /**
     * Initializes a map of arriving products with their quantities and arrival days
     * @param arrivingProducts - Array of arriving product data
     * @param currentDate - The current date to calculate arrival days from
     * @returns Map of product IDs to arrival days and quantities
     */
    private arrivingProductsInit(
        arrivingProducts: ArrivingProduct[],
        currentDate: Date
    ): Map<number, Map<number, number>> {
        const arrivingProductsMap = new Map<number, Map<number, number>>();
        
        arrivingProducts.forEach((product) => {
            const arrivalDate = new Date(product.arrival_date);
            const arrivalDays = this.getDaysBetweenDates(currentDate, arrivalDate);
            
            if (arrivingProductsMap.has(product.product_id)) {
                const productMap = arrivingProductsMap.get(product.product);
                if (productMap?.has(arrivalDays)) {
                    const quantity = productMap.get(arrivalDays) || 0;
                    productMap.set(arrivalDays, quantity + product.arriving_quantity);
                } else {
                    productMap?.set(arrivalDays, product.arriving_quantity);
                }
            } else {
                const productMap = new Map<number, number>();
                productMap.set(arrivalDays, product.arriving_quantity);
                arrivingProductsMap.set(product.product, productMap);
            }
        });
        
        return arrivingProductsMap;
    }

    /**
     * Calculates the number of days between two dates
     * @param date1 - The first date
     * @param date2 - The second date
     * @returns Number of days between the dates
     */
    private getDaysBetweenDates(date1: Date, date2: Date): number {
        const diffTime = Math.abs(date2.getTime() - date1.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
}

export default TransferSizeCalculator;
