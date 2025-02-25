import Cluster from "../../class/Cluster";
import DataProvider from "../../class/DataProvider";
import DataWriter from "../../class/DataWriter";
import Constants from "../../const/Constants";

class Kmeans {
    private _context: any;

    constructor(context: any) {
        this._context = context;
    }

    async dailyRecalc(warehouse: string, period: number, date: Date): Promise<void> {
        let dataProvider = new DataProvider(this._context);
        let dataWriter = new DataWriter(this._context);
        let envValues = await dataProvider.getEnvValues();
        let data = await dataProvider.getWarehouseProductsCluster(warehouse, period, date);

        for (let i = 0; i < data.length; i++) {
            let product = data[i].product;
            let salesData: number[] = data[i].quantities.split(',').map(Number);
            let cluster = new Cluster(this._context);
            let result = await cluster.calculateAll(salesData, envValues.clusterCount);
            result.warehouse = warehouse;
            await dataWriter.writeKmeansCalculatedData(result, product);
        }
    }

    async byWarehouse(warehouse: string): Promise<void> {
        let dataProvider = new DataProvider(this._context);
        let dataWriter = new DataWriter(this._context);
        let dataStart = new Date();
        
        let data = await dataProvider.getAllWarehouseProductsCluster(warehouse);
            
        let totalProducts = data.length;

        for (let i = 0; i < data.length; i++) {
            let product = data[i].product;

            // Display the loading bar in the console
            let progress = ((i + 1) / totalProducts) * 100;
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`Processing product ${product} [${i + 1}/${totalProducts}] - ${progress.toFixed(2)}%`);

            let salesData = await dataProvider.getSalesProductsCluster(product);
            let dataFinish = new Date();
            if (salesData.length < Constants.kmeansDefaultClusterCount) {
                process.stdout.cursorTo(0);
                process.stdout.write(`not enough data for product ${product}`);
            } else {
                let cluster = new Cluster();
                let result = await cluster.calculateAll(salesData, Constants.kmeansDefaultClusterCount);
                let dataTimeStamps = { start: dataStart, finish: dataFinish };
                result.timestamps.data = dataTimeStamps;
                result.warehouse = warehouse;
                await dataWriter.writeKmeansCalculatedData(result, product);
            }
        }

        // Clear the console line after the loop is finished
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
    }

    async byDate(product: string, months: number, clusterNum: number): Promise<void> {
        let dataProvider = new DataProvider(this._context);
        let dataWriter = new DataWriter(this._context);
        let dataStart = new Date();
        let data = await dataProvider.getOrderProductsCluster(product, months);
        if (data == null) {
            await dataWriter.writeError("no data");
        } else {
            let dataFinish = new Date();
            let cluster = new Cluster();
            let result = await cluster.calculateAll(data, clusterNum);
            let dataTimeStamps = { start: dataStart, finish: dataFinish };
            result.timestamps.data = dataTimeStamps;
            
            await dataWriter.writeKmeansCalculatedData(result, product);
        }
    }

    async withWarehouse(product: string, warehouse: string, months: number, clusterNum: number): Promise<void> {
        let dataProvider = new DataProvider(this._context);
        let dataWriter = new DataWriter(this._context);
        let dataStart = new Date();
        let data = await dataProvider.getOrderWarehouseProducts(product, warehouse, months);
        if (data == null) {
            await dataWriter.writeError("no data");
        } else {
            let dataFinish = new Date();
            let cluster = new Cluster();
            let result = await cluster.calculateAll(data, clusterNum);
            let dataTimeStamps = { start: dataStart, finish: dataFinish };
            result.timestamps.data = dataTimeStamps;
            result.warehouse = warehouse;
            await dataWriter.writeKmeansCalculatedData(result, product);
        }
    }

    async default(product: string, clusterNum: number): Promise<void> {
        try {
            let dataProvider = new DataProvider(this._context);
            let dataWriter = new DataWriter(this._context);
            let dataStart = new Date();
            let data = await dataProvider.getSalesProductsCluster(product);
            let dataFinish = new Date();
            if (data.length === 0) {
                await dataWriter.writeError("no data");
            } else {
                let cluster = new Cluster();
                let result = await cluster.calculateAll(data, clusterNum);
                let dataTimeStamps = { start: dataStart, finish: dataFinish };
                result.timestamps.data = dataTimeStamps;
                
                await dataWriter.writeCalculatedData(result, product);
            }
        } catch (err) {
            console.log(err);
        }
    }
}

export default Kmeans;