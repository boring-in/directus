// StockApp 

import { ParallelFlexibleOptimizer } from "./ClusterAnalyzer";
import StockAnalyzer from './StockAnalyzer';
import DataProvider from './DataProvider';
import DataWriter from './DataWriter';
import Constants from '../const/Constants';


interface ClusterStats {
    centroid: number;
    size: number;
    mean: number;
    median: number;
    std: number;
    percentage: number;
    quantiles: {
        q1: number;
        q3: number;
    };
    maxValue: number;
}

interface OptimalCentroid {
    centroid: number;
    size: number;
    percentage: number;
    score: number;
    size_ratio: number;
    confidence_metrics: {
        variance: number;
        stability: number;
        coverage: number;
    };
}

interface ProductAnalysis {
    product_id: string;
    recommended_stock: number;
    confidence_score: number;
    analysis_method: 'clustering' | 'statistical' | 'simple';
    cluster_stats?: ClusterStats[];
    optimal_centroid?: OptimalCentroid;
    outliers?: number[];
    analysis_details: {
        mean: number;
        median: number;
        std: number;
        min: number;
        max: number;
        q1: number;
        q3: number;
    };
    performance_metrics?: {
        execution_time_ms: number;
        memory_used_mb: number;
    };
}

interface BatchAnalysisResult {
    successful_analyses: ProductAnalysis[];
    failed_analyses: Array<{
        product_id: string;
        reason: string;
    }>;
    total_execution_time_ms: number;
    total_products_analyzed: number;
    parallel_execution_details?: {
        workers_used: number;
        avg_worker_time_ms: number;
    };
}

interface ProductOrder {
    product_id: string;
    quantity: number;
}

interface SQLSalesRecord {
    product_id: number;
    quantity: number;
    date: string;
    stockout: number;
    promo: number;
}

interface TimePeriodsAnalysis {
    all: StockMetrics;
    workdays: StockMetrics;
    weekends: StockMetrics;
    weekly: StockMetrics;
    biweekly: StockMetrics;
    monthly: StockMetrics;
}

interface StockAnalysisResult {
    minQuantity: number;
    buffer: number;
    promoBuffer: number;
    totalStock: number;
    bufferMetrics: BufferMetrics;
    metrics: TimePeriodsAnalysis;
}

interface DailySalesData {
    totalQuantity: number;
    hasStockout: boolean;
    promoType: number;
}

interface CleanedSalesRecord {
    date: string;
    quantity: number;
    isOutlier: boolean;
    promo: number;
    stockout: number;
}

interface SalesMetrics {
    mean: number;
    median: number;
    stdDev: number;
}

interface StockoutMetrics {
    regular: number;
    promo: number;
}

interface DataQualityMetrics {
    uniqueDays: number;
    totalOrders: number;
    averageOrdersPerDay: number;
    reliability: 'Low' | 'Medium' | 'High';
}

interface PromoTypeMetrics {
    type: number;
    uplift: number;
    frequency: number;
    mean: number;
    median: number;
    stdDev: number;
}

interface BufferMetrics {
    baseRatio: number;          // Minimalaus kiekio santykis su vidurkiu
    bufferRatio: number;        // Buferio santykis su vidurkiu
    promoBufferRatio: number;   // Promo buferio santykis su vidurkiu
    promoUplift: number;        // Akcijos pardavimų padidėjimo koeficientas
    promoFrequency: number;     // Akcijų dažnumas procentais
}

interface StockMetrics {
    regularSales: SalesMetrics;
    promoSales: SalesMetrics;
    promoMetrics: PromoTypeMetrics[];
    stockoutRate: StockoutMetrics;
    dataQuality: DataQualityMetrics;
    bufferMetrics: BufferMetrics;
    stockLevels: {  
        minQuantity: number;  // minimalus reikalingas sandėlio kiekis be buferio
        buffer: number;		  // reikalingas buferis vienetais
        promoBuffer: number;  // reikalingas buferis vienetais per akcijas
        totalStock: number;   // minQuantity + buffer + promoBuffer
    };
}

  type StockoutRate = {
    regular: number;
    promo: number;
  };
  
  type DataQuality = {
    uniqueDays: number;
    totalOrders: number;
    totalQuantity: number;
    averageOrdersPerDay: number;
    reliability: 'Low' | 'Medium' | 'High';
  };
  

  type StockLevels = {
    minQuantity: number;
    buffer: number;
    promoBuffer: number;
    totalStock: number;
  };
  
  type MetricsData = {
    regularSales: SalesMetrics;
    promoSales: SalesMetrics;
    promoMetrics: any[];
    stockoutRate: StockoutRate;
    dataQuality: DataQuality;
    bufferMetrics: BufferMetrics;
    stockLevels: StockLevels;
  };

interface BufferCalculationOptions {
    confidenceLevel: number; // patikimumo lygis procentais
}

class ProductAnalysisManager {
    dataProvider: DataProvider;
    dataWriter: DataWriter;
    paralellFlexibleOptimizer: ParallelFlexibleOptimizer;
    stockAnalyzer: StockAnalyzer;
    period: number;


    constructor(context:any,period:number = Constants.kmeansProductRetrievalInterval ){
        this.dataProvider = new DataProvider(context);
        this.dataWriter = new DataWriter(context);
        this.paralellFlexibleOptimizer = new ParallelFlexibleOptimizer();
        this.stockAnalyzer = new StockAnalyzer();
        this.period = period;
    };

    public async analyzeAndPersist(){
        let warehouseProductData: Map<number,object[]> = await this.getWarehouseProductData();

       // Convert entries to array first
        const entries = Array.from(warehouseProductData.entries());
        
        for (const entry of entries) {
            const warehouse = entry[0];
            const productData = entry[1];
            
            //@ts-ignore - ProductOrder and SQLSales records are interchangeable
            let clusterData: BatchAnalysisResult = await this.analyzeClusterData(productData);
            //@ts-ignore 
            let stockData: Map<number, StockAnalysisResult> = this.analyzeStockData(warehouse, productData);
            this.persistAllData(warehouse, clusterData, stockData);
        }
        
    };

    private async getWarehouseProductData(){
        let productData = new Map()
        let warehouses = await this.dataProvider.getWarehouses();

        for ( let i = 0; i< warehouses.length; i++){
            let warehouse = warehouses[i].id;
            let childProducts  = await this.dataProvider.getProductsForAnalyzers(warehouse,this.period);
            let parentProducts = await this.dataProvider.getProductsForAnalyzers(warehouse,this.period,true);
            let products = childProducts.concat(parentProducts);
            productData.set(warehouse, products);
        }

            return productData;
    };
    
    private persistAllData(warehouse: number , clusterData: BatchAnalysisResult , stockData: Map<number , StockAnalysisResult>){
        for ( let i = 0; i< clusterData.successful_analyses.length; i++){
            let productAnalysis = clusterData.successful_analyses[i];
            let stockAnalysis  = stockData.get(Number(productAnalysis.product_id));
            this.persistClusterData(warehouse, productAnalysis);
            this.persistStockData(warehouse, stockAnalysis,Number(productAnalysis.product_id));
              
           // this.dataWriter.persistProductAnalysis(warehouse,analysisResult);
        }
        

    };

    private persistClusterData(warehouse: number, productData:any){
        let analysisResult = {
            product: productData.product_id,
            analysisMethod: productData.analysis_method,
            centroid: productData.optimal_centroid?.centroid,// nauji duomenys bus cia
            period : this.period,
            
          }
         this.dataWriter.persistClusterAnalysis(warehouse,analysisResult);

    };

    private persistStockData(warehouse: number, productData,productId:number){
        let metricsMap = new Map<number, MetricsData>();
        let jsonData = productData;

        Object.entries(jsonData).forEach(([key, value]) => {
            //@ts-ignore
        metricsMap.set(key, value);
        });
       
        metricsMap.forEach((metrics, key) => {   
           let data = {
                product : productId,
                period : key,
                warehouse : warehouse,
                mean : metrics.regularSales.mean,
                standardDeviation : metrics.regularSales.stdDev,
                baseRatio : metrics.bufferMetrics.baseRatio,
                bufferRatio : metrics.bufferMetrics.bufferRatio,
                promoBufferRatio : metrics.bufferMetrics.promoBufferRatio,
                promoUplift : metrics.bufferMetrics.promoUplift,
                minStockQty : metrics.stockLevels.minQuantity,
                bufferQty : metrics.stockLevels.buffer,
                promoBufferQty : metrics.stockLevels.promoBuffer,
                reliability : metrics.dataQuality.reliability
            };
            this.dataWriter.persistStockAnalysis(data);
        });

        

    };

    private async analyzeClusterData(productData: ProductOrder[]){
        let result : BatchAnalysisResult = await this.paralellFlexibleOptimizer.analyzeBatchParallel(productData);
        return result;
    };

    private  analyzeStockData(warehouse: number, productData: SQLSalesRecord[]){
        let result =  this.stockAnalyzer.analyzeBulkProducts(productData);
        return result;
    };

}
export default ProductAnalysisManager;
