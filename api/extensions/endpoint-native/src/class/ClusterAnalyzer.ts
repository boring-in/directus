
import * as ss from 'simple-statistics';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import Constants from '../const/Constants';

interface ProductOrder {
    product_id: string;
    quantity: number;
}

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

interface WorkerConfig {
    order_similarity_threshold: number;
    volume_weight: number;
    frequency_weight: number;
    min_cluster_size: number;
    min_data_points: number;
}

interface WorkerResult {
    successful: ProductAnalysis[];
    failed: Array<{ product_id: string; reason: string }>;
    worker_time_ms: number;
}

class ClusterAnalyzer {
    constructor(
        private readonly config: WorkerConfig
    ) {}

    public analyzeData(data: number[]): {
        clusters: number[][];
        centroids: number[];
        stats: ClusterStats[];
        optimal_centroid: OptimalCentroid;
    } {
        const sortedData = [...data].sort((a, b) => a - b);
        const possibleClusters = Math.floor(data.length / this.config.min_cluster_size);
        const k = Math.min(possibleClusters, 5); // Maximum 5 clusters

        const { clusters, centroids } = this.kMeans(data, k);
        const stats = this.calculateClusterStats(clusters, centroids);
        const optimal_centroid = this.findOptimalCentroid(stats);

        return { clusters, centroids, stats, optimal_centroid };
    }

    private kMeans(data: number[], k: number, maxIterations: number = 100): {
        clusters: number[][];
        centroids: number[];
    } {
        // Initialization of centroids using k-means++ method
        let centroids = this.initializeCentroids(data, k);
        let clusters: number[][] = Array(k).fill(null).map(() => []);
        let oldCentroids: number[] = [];
        let iterations = 0;
        let converged = false;

        while (!converged && iterations < maxIterations) {
             // Clearing the clusters
            clusters = Array(k).fill(null).map(() => []);

             // Assigning points to the nearest centroids
            data.forEach(point => {
                const distances = centroids.map(centroid => Math.abs(point - centroid));
                const closestCentroidIndex = distances.indexOf(Math.min(...distances));
                clusters[closestCentroidIndex].push(point);
            });

             // Saving the old centroids for convergence check
            oldCentroids = [...centroids];

            // Updating the centroids
            clusters.forEach((cluster, i) => {
                if (cluster.length > 0) {
                    centroids[i] = cluster.reduce((sum, val) => sum + val, 0) / cluster.length;
                }
            });

            // Checking for convergence
            converged = oldCentroids.every((old, i) => 
                Math.abs(old - centroids[i]) < 0.001
            );

            iterations++;
        }

        return { clusters, centroids };
    }

    private initializeCentroids(data: number[], k: number): number[] {
        const centroids: number[] = [];
         // Choose the first centroid randomly
        centroids.push(data[Math.floor(Math.random() * data.length)]);

        for (let i = 1; i < k; i++) {
            // Calculate the distances to the nearest centroids
            const distances = data.map(point => {
                const minDistance = Math.min(...centroids.map(
                    centroid => Math.abs(point - centroid)
                ));
                return Math.pow(minDistance, 2);
            });

            // Choose the next centroid with probability proportional to the square of the distance
            const sum = distances.reduce((a, b) => a + b, 0);
            let rand = Math.random() * sum;
            let index = 0;
            
            while (rand > 0 && index < distances.length) {
                rand -= distances[index];
                index++;
            }
            centroids.push(data[Math.max(0, index - 1)]);
        }

        return centroids;
    }

    private calculateClusterStats(clusters: number[][], centroids: number[]): ClusterStats[] {
        return clusters.map((cluster, i) => {
            if (cluster.length === 0) {
                throw new Error(`Empty cluster found at index ${i}`);
            }

            const sorted = [...cluster].sort((a, b) => a - b);
            const mean = ss.mean(cluster);
            const totalSize = clusters.reduce((sum, c) => sum + c.length, 0);

            return {
                centroid: centroids[i],
                size: cluster.length,
                mean: mean,
                median: ss.median(sorted),
                std: ss.standardDeviation(cluster),
                percentage: (cluster.length / totalSize) * 100,
                quantiles: {
                    q1: ss.quantile(sorted, 0.25),
                    q3: ss.quantile(sorted, 0.75)
                },
                maxValue: sorted[sorted.length - 1]
            };
        });
    }

    private findOptimalCentroid(stats: ClusterStats[]): OptimalCentroid {
        const maxSize = Math.max(...stats.map(stat => stat.size));
        const candidates = stats
            .filter(stat => {
                const size_ratio = stat.size / maxSize;
                return size_ratio >= (1 - this.config.order_similarity_threshold);
            })
            .map(stat => {
                const size_ratio = stat.size / maxSize;
                const variance = Math.pow(stat.std, 2);
                const stability = 1 / (1 + variance);
                
               // Calculate the coverage of orders by this centroid
                const coverage = this.calculateCoverage(stat, stats);
                
                // Calculate the overall score considering all factors
                const volume_score = stat.centroid / stat.maxValue;
                const frequency_score = stat.size / maxSize;
                
                const total_score = 
                    this.config.volume_weight * volume_score +
                    this.config.frequency_weight * frequency_score +
                    (1 - this.config.volume_weight - this.config.frequency_weight) * coverage;

                return {
                    centroid: stat.centroid,
                    size: stat.size,
                    percentage: stat.percentage,
                    score: total_score,
                    size_ratio,
                    confidence_metrics: {
                        variance,
                        stability,
                        coverage
                    }
                };
            });

        if (candidates.length === 0) {
            const largest = stats.reduce((a, b) => a.size > b.size ? a : b);
            return {
                centroid: largest.centroid,
                size: largest.size,
                percentage: largest.percentage,
                score: 1.0,
                size_ratio: 1.0,
                confidence_metrics: {
                    variance: Math.pow(largest.std, 2),
                    stability: 1,
                    coverage: 1
                }
            };
        }

        // Choose the centroid with the highest score
        return candidates.reduce((a, b) => a.score > b.score ? a : b);
    }

    private calculateCoverage(stat: ClusterStats, allStats: ClusterStats[]): number {
        // Calculate what percentage of orders will be satisfied by this centroid
        const totalOrders = allStats.reduce((sum, s) => sum + s.size, 0);
        const coveredOrders = allStats.reduce((sum, s) => {
            if (s.centroid <= stat.centroid) {
                return sum + s.size;
            }
            return sum;
        }, 0);
        
        return coveredOrders / totalOrders;
    }
}

export class ParallelFlexibleOptimizer {
    private readonly config: WorkerConfig;
    private readonly maxWorkers: number;

    constructor(
        order_similarity_threshold: number = Constants.orderSimiliarityThreshold,
        volume_weight: number =Constants.volumeWeight,
        frequency_weight: number = Constants.frequencyWeight,
        min_cluster_size: number = Constants.minClusterSize,
        min_data_points: number = Constants.minDataPoints,
        maxWorkers: number = Constants.maxWorkers
    ) {
        // Validation of input parameters
        if (volume_weight + frequency_weight > 1) {
            throw new Error('Volume and frequency weights sum must be less than or equal to 1');
        }

        this.config = {
            order_similarity_threshold,
            volume_weight,
            frequency_weight,
            min_cluster_size,
            min_data_points
        };
        
        this.maxWorkers = maxWorkers;
    }

    public async analyzeBatchParallel(orders: ProductOrder[]): Promise<BatchAnalysisResult> {
        const startTime = process.hrtime();

        try {
             // Group orders by products
            const productGroups = this.groupOrdersByProduct(orders);
            
             // Divide the work among workers
            const chunks = this.splitIntoChunks(productGroups);
            
             // Start parallel processing
            const workerPromises = chunks.map(chunk => this.runWorker(chunk));
            const workerResults = await Promise.all(workerPromises);

             // Combine the results
            const results = this.combineWorkerResults(workerResults);
            
            const [executionTime] = process.hrtime(startTime);

            return {
                ...results,
                total_execution_time_ms: executionTime * 1000,
                total_products_analyzed: productGroups.size,
                parallel_execution_details: {
                    workers_used: chunks.length,
                    avg_worker_time_ms: results.avg_worker_time
                }
            };

        } catch (error) {
            console.error('Error in batch analysis:', error);
            throw error;
        }
    }

    public analyzeProduct(product_id: string, quantities: number[]): ProductAnalysis {
        const startTime = process.hrtime();
        const analyzer = new ClusterAnalyzer(this.config);

        try {
            if (quantities.length < this.config.min_data_points) {
                return this.performSimpleAnalysis(product_id, quantities);
            }

            const possibleClusters = Math.floor(quantities.length / this.config.min_cluster_size);
            
            if (possibleClusters >= 2) {
                return this.performClusterAnalysis(product_id, quantities, analyzer);
            } else {
                return this.performStatisticalAnalysis(product_id, quantities);
            }

        } catch (error) {
            console.error(`Error analyzing product ${product_id}:`, error);
            throw error;
        }
    }

    private groupOrdersByProduct(orders: ProductOrder[]): Map<string, number[]> {
        const groups = new Map<string, number[]>();
        
        for (const order of orders) {
            if (!groups.has(order.product_id)) {
                groups.set(order.product_id, []);
            }
            groups.get(order.product_id)!.push(order.quantity);
        }
        
        return groups;
    }

    private splitIntoChunks(productGroups: Map<string, number[]>): Array<Array<[string, number[]]>> {
        const products = Array.from(productGroups.entries());
        const chunkSize = Math.ceil(products.length / this.maxWorkers);
        
        return Array(Math.ceil(products.length / chunkSize))
            .fill(null)
            .map((_, index) => products.slice(index * chunkSize, (index + 1) * chunkSize));
    }

    private runWorker(products: Array<[string, number[]]>): Promise<WorkerResult> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: { 
                    products,
                    config: this.config
                }
            });

            worker.on('message', resolve);
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    private combineWorkerResults(results: WorkerResult[]): {
        successful_analyses: ProductAnalysis[];
        failed_analyses: Array<{ product_id: string; reason: string }>;
        avg_worker_time: number;
    } {
        const successful_analyses: ProductAnalysis[] = [];
        const failed_analyses: Array<{ product_id: string; reason: string }> = [];
        let total_time = 0;

        results.forEach(result => {
            successful_analyses.push(...result.successful);
            failed_analyses.push(...result.failed);
            total_time += result.worker_time_ms;
        });

        return {
            successful_analyses,
            failed_analyses,
            avg_worker_time: total_time / results.length
        };
    }

    private performSimpleAnalysis(product_id: string, quantities: number[]): ProductAnalysis {
        const sorted = [...quantities].sort((a, b) => a - b);
        const mean = ss.mean(quantities);
        
        return {
            product_id,
            recommended_stock: Math.round(mean),
            confidence_score: 0.5,
            analysis_method: 'simple',
            analysis_details: {
                mean: mean,
                median: ss.median(sorted),
                std: quantities.length > 1 ? ss.standardDeviation(quantities) : 0,
                min: sorted[0],
                max: sorted[sorted.length - 1],
                q1: ss.quantile(sorted, 0.25),
                q3: ss.quantile(sorted, 0.75)
            }
        };
    }

    private performStatisticalAnalysis(product_id: string, quantities: number[]): ProductAnalysis {
        const sorted = [...quantities].sort((a, b) => a - b);
        const mean = ss.mean(quantities);
        const std = ss.standardDeviation(quantities);
        const median = ss.median(sorted);
        const q1 = ss.quantile(sorted, 0.25);
        const q3 = ss.quantile(sorted, 0.75);
        
         // Identify outliers
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        const outliers = quantities.filter(x => x < lowerBound || x > upperBound);
        
        // Choose the recommended quantity
        const recommended_stock = outliers.length > 0 ? 
            Math.round(median) : 
            Math.round(mean);

        const confidence_score = this.calculateConfidenceScore(
            quantities.length,
            std / mean,
            outliers.length
        );

        return {
            product_id,
            recommended_stock,
            confidence_score,
            analysis_method: 'statistical',
            analysis_details: {
                mean,
                median,
                std,
                min: sorted[0],
                max: sorted[sorted.length - 1],
                q1,
                q3
            },
            outliers: outliers.length > 0 ? outliers : undefined
        };
    }

    private performClusterAnalysis(
        product_id: string,
        quantities: number[],
        analyzer: ClusterAnalyzer
    ): ProductAnalysis {
        const { clusters, stats, optimal_centroid } = analyzer.analyzeData(quantities);

        return {
            product_id,
            recommended_stock: Math.round(optimal_centroid.centroid),
            confidence_score: optimal_centroid.score,
            analysis_method: 'clustering',
            cluster_stats: stats,
            optimal_centroid,
            analysis_details: {
                mean: ss.mean(quantities),
                median: ss.median(quantities),
                std: ss.standardDeviation(quantities),
                min: Math.min(...quantities),
                max: Math.max(...quantities),
                q1: ss.quantile(quantities, 0.25),
                q3: ss.quantile(quantities, 0.75)
            }
        };
    }

    private calculateConfidenceScore(
        sampleSize: number,
        coefficientOfVariation: number,
        outliersCount: number
    ): number {
        const sampleSizeScore = Math.min(1, sampleSize / 20);
        const variationScore = Math.max(0, 1 - coefficientOfVariation);
        const outliersScore = Math.max(0, 1 - (outliersCount / sampleSize));
        
        return Math.round(
            (0.4 * sampleSizeScore + 0.4 * variationScore + 0.2 * outliersScore) * 100
        ) / 100;
    }
}

// Worker thread code
if (!isMainThread) {
    const { products, config } = workerData;
    const analyzer = new ClusterAnalyzer(config);
    const startTime = process.hrtime();

    const successful: ProductAnalysis[] = [];
    const failed: Array<{ product_id: string; reason: string }> = [];

    for (const [product_id, quantities] of products) {
        try {
            const result = analyzer.analyzeData(quantities);
            
            successful.push({
                product_id,
                recommended_stock: Math.round(result.optimal_centroid.centroid),
                confidence_score: result.optimal_centroid.score,
                analysis_method: 'clustering',
                cluster_stats: result.stats,
                optimal_centroid: result.optimal_centroid,
                analysis_details: {
                    mean: ss.mean(quantities),
                    median: ss.median(quantities),
                    std: ss.standardDeviation(quantities),
                    min: Math.min(...quantities),
                    max: Math.max(...quantities),
                    q1: ss.quantile(quantities, 0.25),
                    q3: ss.quantile(quantities, 0.75)
                }
            });
        } catch (error) {
            failed.push({
                product_id,
                reason: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    const [executionTime] = process.hrtime(startTime);

    parentPort?.postMessage({
        successful,
        failed,
        worker_time_ms: executionTime * 1000
    });
}
