// Type declaration for skmeans module
// declare module 'skmeans' {
//     interface SkmeansResult {
//         it: number;
//         k: number;
//         idxs: number[];
//         centroids: number[];
//     }
    
//     function skmeans(data: number[], k: number): SkmeansResult;
//     export default skmeans;
// }

// import skmeans from "skmeans";

/**
 * Interface for timestamp tracking
 */
interface TimeStamp {
    start: Date;
    finish: Date;
}

/**
 * Interface for cluster calculation timestamps
 */
interface ClusterTimeStamps {
    main: {
        startTimeStamp: Date;
        finishTimeStamp: Date;
    };
    cluster: TimeStamp;
    count: TimeStamp;
    minMax: TimeStamp;
    percentages: TimeStamp;
}

/**
 * Interface for cluster calculation results
 */
interface ClusterResult {
    iterations: number;
    centroids: number[];
    clusterSizes: number[];
    clusterMinMax: ClusterMinMaxItem[];
    clusterPercentages: number[];
}

/**
 * Interface for the complete cluster calculation response
 */
interface ClusterResponse {
    res: ClusterResult;
    timestamps: ClusterTimeStamps;
}

/**
 * Interface for cluster min/max values
 */
interface ClusterMinMaxItem {
    cluster: number;
    min: number | null;
    max: number | null;
}

/**
 * Interface for index count result
 */
interface IdxCountResult {
    groupCountArr: number[];
    timeStamps: TimeStamp;
}

/**
 * Interface for min/max calculation result
 */
interface IdxMinMaxResult {
    idxMinMax: ClusterMinMaxItem[];
    timeStamps: TimeStamp;
}

/**
 * Class for performing cluster analysis on numerical data
 * @class Cluster
 */
class Cluster {
    /**
     * Calculates clusters for all of the provided data
     * @param dataProvided - Array of numerical values to cluster
     * @param clusterCount - Number of clusters to create
     * @returns Promise<ClusterResponse> - Cluster calculation results and timing information
     */
    async calculateAll(dataProvided: number[], clusterCount: number): Promise<ClusterResponse> {
        const startTimeStamp = new Date();
        const clusterEngine = skmeans;
        const data = dataProvided;

        // Perform clustering
        const clusterStart = new Date();
        const res = clusterEngine(data, clusterCount);
        const clusterFinish = new Date();
        
        const clusterTimestampJson: TimeStamp = {
            start: clusterStart,
            finish: clusterFinish
        };

        // Calculate cluster statistics
        const idxs = res.idxs;
        const idxCount = this.idxCount(idxs, res.centroids.length);
        const idxMinMax = this.idxMinMax(idxs, data, res.centroids.length);

        // Calculate percentages
        const percentages: number[] = [];
        const percentagesStart = new Date();
        for (let i = 0; i < res.centroids.length; i++) {
            const clusterPercentage = this.clusterPercentage(idxCount.groupCountArr, i);
            percentages.push(clusterPercentage);
        }
        const percentagesFinish = new Date();

        const precentagesTimestamps: TimeStamp = {
            start: percentagesStart,
            finish: percentagesFinish
        };

        const finishTimeStamp = new Date();
        const timestampJson = {
            startTimeStamp: startTimeStamp,
            finishTimeStamp: finishTimeStamp
        };

        const timeStamps: ClusterTimeStamps = {
            main: timestampJson,
            cluster: clusterTimestampJson,
            count: idxCount.timeStamps,
            minMax: idxMinMax.timeStamps,
            percentages: precentagesTimestamps
        };

        const dataJson: ClusterResult = {
            iterations: res.it,
            centroids: res.centroids,
            clusterSizes: idxCount.groupCountArr,
            clusterMinMax: idxMinMax.idxMinMax,
            clusterPercentages: percentages
        };

        return {
            res: dataJson,
            timestamps: timeStamps
        };
    }

    /**
     * Counts the number of data points in each cluster
     * @param idxArr - Array of cluster indices
     * @param clusterCount - Total number of clusters
     * @returns IdxCountResult - Count of items in each cluster and timing information
     */
    private idxCount(idxArr: number[], clusterCount: number): IdxCountResult {
        const startTimeStamp = new Date();
        const groupCountArr: number[] = new Array(clusterCount).fill(0);

        // Safely count occurrences
        idxArr.forEach((idx) => {
            if (idx >= 0 && idx < clusterCount) {
                groupCountArr[idx] += 1;
            }
        });

        const finishTimeStamp = new Date();
        const timeStamps: TimeStamp = {
            start: startTimeStamp,
            finish: finishTimeStamp
        };

        return {
            groupCountArr,
            timeStamps
        };
    }

    /**
     * Calculates the minimum and maximum values for each cluster
     * @param idxArr - Array of cluster indices
     * @param dataArr - Array of data points
     * @param clusterCount - Total number of clusters
     * @returns IdxMinMaxResult - Min/max values for each cluster and timing information
     */
    private idxMinMax(idxArr: number[], dataArr: number[], clusterCount: number): IdxMinMaxResult {
        const startTimeStamp = new Date();
        const resArr: ClusterMinMaxItem[] = Array.from({ length: clusterCount }, (_, i) => ({
            cluster: i,
            min: null,
            max: null
        }));

        // Safely process min/max values
        idxArr.forEach((idx, x) => {
            if (idx >= 0 && idx < clusterCount && x < dataArr.length) {
                const number = dataArr[x];
                const item = resArr[idx];
                if (item.min === null || number < item.min) {
                    item.min = number;
                }
                if (item.max === null || number > item.max) {
                    item.max = number;
                }
            }
        });

        const finishTimeStamp = new Date();
        const timeStamps: TimeStamp = {
            start: startTimeStamp,
            finish: finishTimeStamp
        };

        return {
            idxMinMax: resArr,
            timeStamps
        };
    }

    /**
     * Calculates the percentage of data points in a specific cluster
     * @param idxCount - Array containing count of items in each cluster
     * @param clusterIndex - Index of the cluster to calculate percentage for
     * @returns number - Percentage of data points in the specified cluster
     */
    private clusterPercentage(idxCount: number[], clusterIndex: number): number {
        if (clusterIndex < 0 || clusterIndex >= idxCount.length) {
            return 0;
        }
        
        const cluster = idxCount[clusterIndex];
        const clusterSum = idxCount.reduce((partialSum, a) => partialSum + a, 0);
        
        if (clusterSum === 0) {
            return 0;
        }
        
        return (cluster / clusterSum) * 100;
    }
}

export default Cluster;
