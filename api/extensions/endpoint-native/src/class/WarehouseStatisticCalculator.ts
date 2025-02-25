/**
 * Interface representing the structure of warehouse sales data
 */
interface WarehouseSale {
    product: string;
    quantity: number;
}

/**
 * Class responsible for calculating warehouse sales statistics
 */
class WarehouseStatisticCalculator {
    private _warehouseSalesData: WarehouseSale[];

    /**
     * Creates an instance of WarehouseStatisticCalculator
     * @param warehouseSalesData Array of warehouse sales data
     */
    constructor(warehouseSalesData: WarehouseSale[]) {
        this._warehouseSalesData = warehouseSalesData;
    }

    /**
     * Calculates sales statistics by aggregating quantities per product
     * @returns Array of aggregated sales data per product
     */
    statistic(): WarehouseSale[] {
        const salesStatisticArray: WarehouseSale[] = [];

        for (let x = 0; x < this._warehouseSalesData.length; x++) {
            const data = this._warehouseSalesData[x];
            
            if (x === 0) {
                const newJson: WarehouseSale = {
                    product: data.product,
                    quantity: data.quantity
                };
                salesStatisticArray.push(newJson);
            } else {
                const dataIndex = salesStatisticArray.findIndex(x => x.product === data.product);
                
                if (dataIndex >= 0) {
                    const currentJson = salesStatisticArray[dataIndex];
                    currentJson.quantity += data.quantity;
                    salesStatisticArray[dataIndex] = currentJson;
                } else {
                    const newJson: WarehouseSale = {
                        product: data.product,
                        quantity: data.quantity
                    };
                    salesStatisticArray.push(newJson);
                }
            }
        }

        return salesStatisticArray;
    }
}

export default WarehouseStatisticCalculator;
