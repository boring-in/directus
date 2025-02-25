import { cpus } from 'os';
const receivedStatus = 1
const processingStatus = 2
const preparingStatus = 3
const completedStatus = 4
const cancelledStatus = 5
const paymnetReceivedStatus = 48
const orderProcessingStatus = 50
const missingPorductsStatus = 37
const productsOrderedStatus = 31
const orderPreparingStatus =  50// must be 50 
const psHost ="gerilesiai.lt"
const psPort ="3306"
const psUser ="csm2s4rex_lawree"
const psPassword ="4pGTqvC78JsgTSHG"
const psDatabase ="csm2s4rex_cosmo"
const log = true;
const logDataType = true;
const default_calculation_type = 3;
const default_calculations_timespan= 360;
const default_calculations_order_count= 1;
const default_calculations_buffer= 1.2;
const default_calculations_moq =  50;
const psWh1 = 5;
const psWh2 = 6;
const psWh3 = 7;
const kmeans_default_cluster_count = 3;
const kmeans_default_iterations = 10;
const kmeans_product_retrieval_interval = 180;
const kmeans_statistic_calulcations_interval = 180;
const order_similiarity_threshold = 0.1;
const volume_weight = 0.7;
const frequency_weight = 0.3;
const min_cluster_size = 3;
const min_data_points = 5;
const max_workers = cpus().length - 1 ;


class Constants{
   
        static get receivedStatus(){
            return receivedStatus;
        }
        static get processingStatus(){
            return processingStatus;
        }
        static get preparingStatus(){
            return preparingStatus;
        }
        static get completedStatus(){
            return completedStatus;
        }
        static get cancelledStatus(){
            return cancelledStatus;
        }
        static get paymnetReceivedStatus(){
            return paymnetReceivedStatus;
        }
        static get orderProcessingStatus(){
            return orderProcessingStatus;
        }
        static get missingPorductsStatus(){
            return missingPorductsStatus;
        }
        static get productsOrderedStatus(){
            return productsOrderedStatus;
        }
        static get orderPreparingStatus(){
            return orderPreparingStatus;
        }
        static get psHost(){
            return psHost;
        }
        static get psPort(){
            return psPort;
        }
        static get psUser(){
            return psUser;
        }
        static get psPassword(){
            return psPassword;
        }
        static get psDatabase(){
            return psDatabase;
        }
        static get log(){
            return log;
        }
        static get logDataType(){
            return logDataType;
        }
   
        static get defaultCalculationType(){
            return default_calculation_type;
        }
        static get defaultCalculationTimespan(){
            return default_calculations_timespan;
        }
        static get defaultCalculationOrderCount(){
            return default_calculations_order_count;
        }
        static get defaultCalculationBuffer(){
            return default_calculations_buffer;
        }
        static get defaultCalculationMoq(){
            return default_calculations_moq;
        }
        static get kmeansDefaultClusterCount(){
            return kmeans_default_cluster_count;
        }
        static get kmeansDefaultIterations(){
            return kmeans_default_iterations;
        }
        static get kmeansProductRetrievalInterval(){
            return kmeans_product_retrieval_interval;
        }
        static get kmeansStatisticCalculationsInterval(){
            return kmeans_statistic_calulcations_interval;
        }
        static get orderSimiliarityThreshold(){
            return order_similiarity_threshold;
        }
        static get volumeWeight(){
            return volume_weight;
        }
        static get frequencyWeight(){
            return frequency_weight;
        }
        static get minClusterSize(){
            return min_cluster_size;
        }
        static get minDataPoints(){
            return min_data_points;
        }
        static get maxWorkers(){
            return max_workers;
        }
        
        static getPsWarehouse(warehouse:number){
            switch(warehouse){
                case 1:
                    return psWh1;
                case 2:
                    return psWh2;
                case 3:
                    return psWh3;
            }
            return null;
        }
        static getPsWarehouseId(warehouse:number){
            switch(warehouse){
                case psWh1:
                    return 1;
                case psWh2:
                    return 2;
                case psWh3:
                    return 3;
            }
            return null;
        }

        static getMapedOrderStatus(inStatus:number){
            let status;
            switch (inStatus){
                case 2:
                    status = 48;
                    break;
                case 34:
                    status = 8;
                    break;
                case 19:
                    status=10;
                    break;
                case 21:
                    status = 11;
                    break;
                case 42:
                    status=12;
                    break;
                case 17:
                    status=13;
                    break;
                case 4:
                    status=39;
                    break;
                case 5:
                    status=40;
                    break;
                default:
                    status=null;
                    break;
            }
            return status;
        }

}
export default Constants;
