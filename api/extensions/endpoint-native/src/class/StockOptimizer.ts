/* package.json ištrauka:
{
  "dependencies": {
    "simple-statistics": "^7.8.3",
    "typescript": "^5.0.4",
    "@types/node": "^18.0.0"
  }
}*/


import * as ss from 'simple-statistics';

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
    maxValue: number;  // Pridėta maksimali reikšmė
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
    };
}

interface AnalysisResult {
    status: 'success' | 'insufficient_data';
    message?: string;
    cluster_stats?: ClusterStats[];
    optimal_centroid?: OptimalCentroid;
    outliers?: number[];
    performance_metrics?: {
        execution_time_ms: number;
        memory_used_mb: number;
    };
    distribution_metrics?: {
        skewness: number;
        kurtosis: number;
        mode: number;
    };
}

export class StockOptimizer {
    private readonly order_similarity_threshold: number;
    private readonly volume_weight: number;
    private readonly frequency_weight: number;
    private readonly min_cluster_size: number;

    constructor(
        order_similarity_threshold: number = 0.1,
        volume_weight: number = 0.7,
        frequency_weight: number = 0.3,
        min_cluster_size: number = 5
    ) {
        this.order_similarity_threshold = order_similarity_threshold;
        this.volume_weight = volume_weight;
        this.frequency_weight = frequency_weight;
        this.min_cluster_size = min_cluster_size;
    }

    public analyzeOrderPatterns(quantities: number[], n_clusters: number = 5): AnalysisResult {
        const startTime = process.hrtime();
        const initialMemory = process.memoryUsage().heapUsed;

        try {
            if (quantities.length < this.min_cluster_size * n_clusters) {
                return {
                    status: 'insufficient_data',
                    message: `Reikia bent ${this.min_cluster_size * n_clusters} užsakymų patikimai analizei`
                };
            }

            // Pašaliname išskirtis naudojant Tukey metodą
            const { cleanData, outliers } = this.removeOutliers(quantities);
            
            // Randame natūralius klasterius
            const clusters = this.findNaturalClusters(cleanData, n_clusters);
            
            // Skaičiuojame statistikas kiekvienam klasteriui
            const cluster_stats = clusters.map(cluster => this.calculateClusterStats(cluster));
            
            // Randame optimalų centroidą
            const optimal_centroid = this.findOptimalCentroid(cluster_stats);

            // Skaičiuojame papildomas distribucijos metrikas
            const distribution_metrics = {
                skewness: ss.sampleSkewness(cleanData),
                kurtosis: ss.sampleKurtosis(cleanData),
                mode: ss.mode(cleanData)
            };

            const [executionTime] = process.hrtime(startTime);
            const memoryUsed = (process.memoryUsage().heapUsed - initialMemory) / 1024 / 1024;

            return {
                status: 'success',
                cluster_stats,
                optimal_centroid,
                outliers,
                distribution_metrics,
                performance_metrics: {
                    execution_time_ms: executionTime * 1000,
                    memory_used_mb: memoryUsed
                }
            };

        } catch (error) {
            const e = error as Error;
            console.error('Klaida analizuojant duomenis:', e);
            throw new Error(`Analizės klaida: ${e.message}`);
        }
    }

    private removeOutliers(data: number[]): { cleanData: number[], outliers: number[] } {
        const sortedData = [...data].sort((a, b) => a - b);
        const q1 = ss.quantile(sortedData, 0.25);
        const q3 = ss.quantile(sortedData, 0.75);
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        const outliers = data.filter(x => x < lowerBound || x > upperBound);
        const cleanData = data.filter(x => x >= lowerBound && x <= upperBound);

        return { cleanData, outliers };
    }

    private findNaturalClusters(data: number[], k: number): number[][] {
        const sortedData = [...data].sort((a, b) => a - b);
        const dataSize = sortedData.length;
        const clusterSize = Math.floor(dataSize / k);
        
        const clusters: number[][] = Array(k).fill(null).map(() => []);
        let currentCluster = 0;
        let currentSize = 0;

        for (let i = 0; i < dataSize; i++) {
            if (currentSize >= clusterSize && currentCluster < k - 1) {
                currentCluster++;
                currentSize = 0;
            }
            clusters[currentCluster].push(sortedData[i]);
            currentSize++;
        }

        return clusters;
    }

    private calculateClusterStats(cluster: number[]): ClusterStats {
        const size = cluster.length;
        if (size === 0) {
            throw new Error('Negalima skaičiuoti statistikų tuščiam klasteriui');
        }

        const sorted = [...cluster].sort((a, b) => a - b);
        const mean = ss.mean(cluster);

        return {
            centroid: mean,
            size: size,
            mean: mean,
            median: ss.median(sorted),
            std: ss.standardDeviation(cluster),
            percentage: 0, // Bus užpildyta vėliau
            quantiles: {
                q1: ss.quantile(sorted, 0.25),
                q3: ss.quantile(sorted, 0.75)
            },
            maxValue: sorted[sorted.length - 1] // Maksimali klasterio reikšmė
        };
    }

    private findOptimalCentroid(cluster_stats: ClusterStats[]): OptimalCentroid {
        // Apskaičiuojame procentus
        const totalSize = cluster_stats.reduce((sum, stat) => sum + stat.size, 0);
        cluster_stats.forEach(stat => {
            stat.percentage = (stat.size / totalSize) * 100;
        });

        const maxSize = Math.max(...cluster_stats.map(stat => stat.size));
        const candidates = cluster_stats
            .filter(stat => stat.size / maxSize >= (1 - this.order_similarity_threshold))
            .map(stat => {
                const variance = Math.pow(stat.std, 2);
                const stability = 1 / (1 + variance);
                
                return {
                    centroid: stat.centroid,
                    size: stat.size,
                    percentage: stat.percentage,
                    size_ratio: stat.size / maxSize,
                    score: this.calculateScore(stat, maxSize),
                    confidence_metrics: {
                        variance,
                        stability
                    }
                };
            });

        if (candidates.length === 0) {
            const largest = cluster_stats.reduce((a, b) => a.size > b.size ? a : b);
            return {
                centroid: largest.centroid,
                size: largest.size,
                percentage: largest.percentage,
                score: 1.0,
                size_ratio: 1.0,
                confidence_metrics: {
                    variance: Math.pow(largest.std, 2),
                    stability: 1
                }
            };
        }

        return candidates.reduce((a, b) => a.score > b.score ? a : b);
    }

    private calculateScore(stat: ClusterStats, maxSize: number): number {
        // Pataisyta volume_score skaičiavimo logika
        const volume_score = stat.centroid / stat.maxValue; // Naudojame maksimalią klasterio reikšmę
        const frequency_score = stat.size / maxSize;
        const consistency_score = 1 / (1 + stat.std);

        return (
            this.volume_weight * volume_score +
            this.frequency_weight * frequency_score +
            (1 - this.volume_weight - this.frequency_weight) * consistency_score
        );
    }
}


// Naudojimo pavyzdys:
/*
const optimizer = new StockOptimizer(
    0.1,    // Užsakymų panašumo slenkstis
    0.7,    // Centroido dydžio svoris
    0.3,    // Dažnio svoris
    5       // Minimalus klasterio dydis
);

const quantities = [5, 3, 4, 10, 12, 5, 6, 15, 4, 5, 10, 11, 3, 4, 5];

try {
    const result = optimizer.analyzeOrderPatterns(quantities, 4);
    console.log('Analizės rezultatai:', result);
    
    if (result.status === 'success' && result.optimal_centroid) {
        console.log('Rekomenduojamas atsargų kiekis:', 
            Math.round(result.optimal_centroid.centroid));
        console.log('Patikimumas:', 
            result.optimal_centroid.score.toFixed(2));
        console.log('Vykdymo laikas:', 
            result.performance_metrics?.execution_time_ms.toFixed(2), 'ms');
    }
} catch (error) {
    console.error('Klaida:', error.message);
}
*/