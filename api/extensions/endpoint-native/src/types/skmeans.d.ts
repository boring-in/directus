declare module 'skmeans' {
    interface SkmeansResult {
        it: number;
        k: number;
        idxs: number[];
        centroids: number[];
    }
    
    function skmeans(data: number[], k: number): SkmeansResult;
    export = skmeans;
}
