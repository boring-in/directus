interface ClusterStats {
    size: number;
    percentage: number;
    centroid: number;
    variance: number;
    compactness: number;
}

interface SalesData {
    [key: string]: any;
}

class SalesClusterAnalyzer {
    private data: SalesData[];
    private orderCol: string;
    private quantityCol: string;
    private scaler: StandardScaler;

    constructor(data: SalesData[], orderCol: string, quantityCol: string) {
        this.data = data;
        this.orderCol = orderCol;
        this.quantityCol = quantityCol;
        this.scaler = new StandardScaler();
    }

    private prepareData(): number[][] {
        // Group and sum quantities per order
        const orderQuantities = new Map<any, number>();
        this.data.forEach(row => {
            const orderId = row[this.orderCol];
            const quantity = row[this.quantityCol] || 0;
            orderQuantities.set(orderId, (orderQuantities.get(orderId) || 0) + quantity);
        });

        // Convert to array and reshape
        const quantities = Array.from(orderQuantities.values()).map(q => [q]);
        return this.scaler.fitTransform(quantities);
    }

    public async findOptimalK(kRange: number[]): Promise<{ wcss: number[], silhouetteScores: number[] }> {
        const wcss: number[] = [];
        const silhouetteScores: number[] = [];
        const X = this.prepareData();

        for (const k of kRange) {
            const kmeans = new KMeans(k, 10, 300);
            const labels = await kmeans.fit(X);
            wcss.push(kmeans.inertia);

            if (k > 1) {
                silhouetteScores.push(calculateSilhouetteScore(X, labels));
            }
        }

        return { wcss, silhouetteScores };
    }

    public async analyzeClusters(k: number, maxIter: number = 300): Promise<ClusterStats[]> {
        const X = this.prepareData();
        const kmeans = new KMeans(k, 10, maxIter);
        const labels = await kmeans.fit(X);
        const centroids = kmeans.clusterCenters;

        // Transform centroids back to original scale
        const centroidsOriginal = this.scaler.inverseTransform(centroids);

        const clusterStats: ClusterStats[] = [];

        for (let i = 0; i < k; i++) {
            const clusterData = X.filter((_, index) => labels[index] === i);
            const clusterCenter = centroids[i];

            clusterStats.push({
                size: clusterData.length,
                percentage: (clusterData.length / X.length) * 100,
                centroid: centroidsOriginal[i][0],
                variance: calculateVariance(clusterData),
                compactness: calculateCompactness(clusterData, clusterCenter)
            });
        }

        return clusterStats;
    }
}

// Helper class for standardization
class StandardScaler {
    private mean: number[] = [];
    private std: number[] = [];

    public fitTransform(X: number[][]): number[][] {
        this.fit(X);
        return this.transform(X);
    }

    private fit(X: number[][]): void {
        const n = X[0].length;
        this.mean = Array(n).fill(0);
        this.std = Array(n).fill(0);

        // Calculate mean
        for (let i = 0; i < n; i++) {
            this.mean[i] = X.reduce((sum, row) => sum + row[i], 0) / X.length;
        }

        // Calculate standard deviation
        for (let i = 0; i < n; i++) {
            this.std[i] = Math.sqrt(
                X.reduce((sum, row) => sum + Math.pow(row[i] - this.mean[i], 2), 0) / X.length
            );
        }
    }

    public transform(X: number[][]): number[][] {
        return X.map(row =>
            row.map((val, i) => (val - this.mean[i]) / (this.std[i] || 1))
        );
    }

    public inverseTransform(X: number[][]): number[][] {
        return X.map(row =>
            row.map((val, i) => val * (this.std[i] || 1) + this.mean[i])
        );
    }
}

// Simple K-means implementation
class KMeans {
    private k: number;
    private nInit: number;
    private maxIter: number;
    public inertia: number = 0;
    public clusterCenters: number[][] = [];

    constructor(k: number, nInit: number, maxIter: number) {
        this.k = k;
        this.nInit = nInit;
        this.maxIter = maxIter;
    }

    public async fit(X: number[][]): Promise<number[]> {
        // Initialize centroids randomly
        this.clusterCenters = this.initializeCentroids(X);
        let labels: number[] = [];
        let changed = true;
        let iteration = 0;

        while (changed && iteration < this.maxIter) {
            const newLabels = this.assignClusters(X);
            changed = !arraysEqual(labels, newLabels);
            labels = newLabels;
            this.updateCentroids(X, labels);
            iteration++;
        }

        this.inertia = this.calculateInertia(X, labels);
        return labels;
    }

    private initializeCentroids(X: number[][]): number[][] {
        const centroids: number[][] = [];
        const n = X[0].length;
        
        for (let i = 0; i < this.k; i++) {
            const centroid = Array(n).fill(0).map(() => 
                Math.random() * (Math.max(...X.map(row => row[0])) - 
                Math.min(...X.map(row => row[0]))) + 
                Math.min(...X.map(row => row[0]))
            );
            centroids.push(centroid);
        }
        
        return centroids;
    }

    private assignClusters(X: number[][]): number[] {
        return X.map(point => {
            const distances = this.clusterCenters.map(centroid =>
                euclideanDistance(point, centroid)
            );
            return distances.indexOf(Math.min(...distances));
        });
    }

    private updateCentroids(X: number[][], labels: number[]): void {
        for (let i = 0; i < this.k; i++) {
            const clusterPoints = X.filter((_, index) => labels[index] === i);
            if (clusterPoints.length > 0) {
                this.clusterCenters[i] = calculateMean(clusterPoints);
            }
        }
    }

    private calculateInertia(X: number[][], labels: number[]): number {
        return X.reduce((sum, point, i) => 
            sum + Math.pow(euclideanDistance(point, this.clusterCenters[labels[i]]), 2), 0
        );
    }
}

// Helper functions
function euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(
        a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
}

function calculateMean(points: number[][]): number[] {
    const n = points[0].length;
    return Array(n).fill(0).map((_, i) =>
        points.reduce((sum, p) => sum + p[i], 0) / points.length
    );
}

function calculateVariance(points: number[][]): number {
    const mean = calculateMean(points);
    return points.reduce((sum, point) =>
        sum + Math.pow(euclideanDistance(point, mean), 2), 0
    ) / points.length;
}

function calculateCompactness(points: number[][], center: number[]): number {
    return points.reduce((sum, point) =>
        sum + euclideanDistance(point, center), 0
    ) / points.length;
}

function calculateSilhouetteScore(X: number[][], labels: number[]): number {
    // Simplified silhouette score calculation
    const uniqueLabels = [...new Set(labels)];
    let totalScore = 0;
    let count = 0;

    for (let i = 0; i < X.length; i++) {
        const a = calculateIntraClusterDistance(X[i], X, labels, labels[i]);
        const b = calculateInterClusterDistance(X[i], X, labels, labels[i]);
        const score = (b - a) / Math.max(a, b);
        totalScore += score;
        count++;
    }

    return totalScore / count;
}

function calculateIntraClusterDistance(point: number[], X: number[][], labels: number[], label: number): number {
    const clusterPoints = X.filter((_, i) => labels[i] === label && i !== X.indexOf(point));
    if (clusterPoints.length === 0) return 0;
    
    return clusterPoints.reduce((sum, p) => sum + euclideanDistance(point, p), 0) / clusterPoints.length;
}

function calculateInterClusterDistance(point: number[], X: number[][], labels: number[], label: number): number {
    const otherLabels = [...new Set(labels)].filter(l => l !== label);
    return Math.min(...otherLabels.map(l => {
        const clusterPoints = X.filter((_, i) => labels[i] === l);
        return clusterPoints.reduce((sum, p) => sum + euclideanDistance(point, p), 0) / clusterPoints.length;
    }));
}

function arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
}

// Example usage:
/*
const data = [
    { OrderID: 1, Quantity: 5 },
    { OrderID: 2, Quantity: 3 },
    // ... more data
];

const analyzer = new SalesClusterAnalyzer(data, 'OrderID', 'Quantity');

// Find optimal k
analyzer.findOptimalK(Array.from({length: 6}, (_, i) => i + 2))
    .then(({ wcss, silhouetteScores }) => {
        console.log('WCSS:', wcss);
        console.log('Silhouette Scores:', silhouetteScores);
    });

// Analyze clusters
analyzer.analyzeClusters(4)
    .then(clusterStats => {
        console.log('Cluster Analysis:', clusterStats);
    });
*/