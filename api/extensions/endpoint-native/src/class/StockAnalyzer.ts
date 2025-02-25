import { 
    mean, 
    median, 
    standardDeviation,
    medianAbsoluteDeviation
} from 'simple-statistics';

interface SQLSalesRecord {
    product_id: number;
    quantity: number;
    date: string;
    stockout: number;
    promo: number;
}

interface TimePeriodsAnalysis {
    daily: StockMetrics;
    workdays: StockMetrics;
    weekends: StockMetrics;
    weekly: StockMetrics;
    biweekly: StockMetrics;
    monthly: StockMetrics;
}

interface StockAnalysisResult {
    daily: StockMetrics;      
    workdays: StockMetrics;
    weekends: StockMetrics;
    weekly: StockMetrics;
    biweekly: StockMetrics;
    monthly: StockMetrics;
}

interface DailySalesData {
    totalQuantity: number;
    hasStockout: boolean;
    promoTypes: number[];
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
    totalQuantity: number;
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

interface BufferCalculationOptions {
    confidenceLevel: number; // patikimumo lygis procentais
}

class StockAnalyzer {
														// Minimalūs reikalavimai dienoms ir užsakymams
    private readonly MIN_UNIQUE_DAYS = 14;				// 30+ įrašų statistiškai jau laikoma patikima imtimi, minimalus 14 dienų (2 savaitės)
	private readonly MIN_ORDERS = 30;
    private readonly BASE_MINIMUM = 1;					// Mažiausiai 1 prekės vnt.
    private readonly MODIFIED_Z_SCORE_THRESHOLD = 3.5;  // Naudojama konservatyvi riba (3.5), kuri reiškia, kad tik tikrai išsiskiriantys užsakymai bus laikomi anomalijomis
    private readonly PROMO_UPLIFT_SAFETY = 1;			// santykis, kurį "užsimetam" promo akcijoms dėl visa ko.
	private readonly GAUS_CONST = 0.6745;				// konstanta, kuri siejasi su normaliuoju (Gauso) pasiskirstymu, kad modifikuotas Z-score būtų suderinamas su standartiniu Z-score normaliajam pasiskirstymui
	private readonly CONFIDENCE_LEVELS = {				// patikimumo rodiklis buferiui. Default 80, t.y. 80% atvejų prekių su tokiu buferiu turėtų užtekti
        70: 0.524,
        75: 0.674,
        80: 0.842,
        85: 1.037,
        90: 1.282,
        95: 1.645,
        96: 1.751,
        97: 1.881,
        98: 2.054,
        99: 2.326,
        99.9: 3.090
    };

	public analyzeBulkProducts(sqlData: SQLSalesRecord[], options: BufferCalculationOptions = { confidenceLevel: 80 }): Map<number, StockAnalysisResult> {
		const productGroups = this.groupByProduct(sqlData);
		const results = new Map<number, StockAnalysisResult>();

		// Array.from naudojimas iteracijai
		Array.from(productGroups.entries()).forEach(([productId, productData]) => {
			const analysis = this.analyzeProduct(productData, options);
			results.set(productId, analysis);
		});

		return results;
	}

	private groupByProduct(data: SQLSalesRecord[]): Map<number, SQLSalesRecord[]> {
		return data.reduce((map, record) => {
			if (!map.has(record.product_id)) {
				map.set(record.product_id, []);
			}
			const productRecords = map.get(record.product_id);
			if (productRecords) {  // Null check pridėjimas
				productRecords.push(record);
			}
			return map;
		}, new Map<number, SQLSalesRecord[]>());
	}

    private cleanOrderOutliers(data: SQLSalesRecord[]): CleanedSalesRecord[] {
        // Grupuojame užsakymus pagal promo tipą
        const ordersByPromoType = new Map<number, SQLSalesRecord[]>();
        
        data.forEach(record => {
            if (!ordersByPromoType.has(record.promo)) {
                ordersByPromoType.set(record.promo, []);
            }
            ordersByPromoType.get(record.promo)!.push(record);
        });
        
        const cleanedOrders: CleanedSalesRecord[] = [];
        
        // Kiekvienam promo tipui atskirai skaičiuojame anomalijas
        ordersByPromoType.forEach((orders, promoType) => {
            const quantities = orders.map(o => o.quantity);
            const medianValue = median(quantities);
            const mad = medianAbsoluteDeviation(quantities);
            
            orders.forEach(order => {
                const modifiedZScore = (this.GAUS_CONST * Math.abs(order.quantity - medianValue)) / mad;
                cleanedOrders.push({
                    date: order.date,
                    quantity: order.quantity,
                    isOutlier: modifiedZScore > this.MODIFIED_Z_SCORE_THRESHOLD,
                    promo: order.promo,
                    stockout: order.stockout
                });
            });
        });
        
        return cleanedOrders;
    }

    private aggregateDailySales(data: CleanedSalesRecord[]): Map<string, DailySalesData> {
		const dailyData = new Map<string, DailySalesData>();
		
		data.filter(record => !record.isOutlier)
			.forEach(record => {
				if (!dailyData.has(record.date)) {
					dailyData.set(record.date, {
						totalQuantity: 0,
						hasStockout: false,
						promoTypes: [] 
					});
				}
				
				const dayData = dailyData.get(record.date)!;
				dayData.totalQuantity += record.quantity;
				dayData.hasStockout = dayData.hasStockout || record.stockout === 1;
				if (record.promo > 0 && !dayData.promoTypes.includes(record.promo)) {
					dayData.promoTypes.push(record.promo);
				}
		});
		
		return dailyData;
	}
	
	public analyzeProduct(data: SQLSalesRecord[], options: BufferCalculationOptions = { confidenceLevel: 80 }): StockAnalysisResult {
		const cleanedOrders = this.cleanOrderOutliers(data);
		const dailyData = this.aggregateDailySales(cleanedOrders);
		const periodsAnalysis = this.analyzeTimePeriods(dailyData, options);
		
		return {
			daily: periodsAnalysis.daily,      
			workdays: periodsAnalysis.workdays,
			weekends: periodsAnalysis.weekends,
			weekly: periodsAnalysis.weekly,
			biweekly: periodsAnalysis.biweekly,
			monthly: periodsAnalysis.monthly
		};
	}

    private splitSalesByType(dailyData: Map<string, DailySalesData>): {
		regularSales: number[],
		promoSalesByType: Map<number, number[]>
	} {
		const regularSales: number[] = [];
		const promoSalesByType = new Map<number, number[]>();

		Array.from(dailyData.entries()).forEach(([_, dayData]) => {
			if (dayData.promoTypes.length === 0) {
				// Jei nėra akcijų, pridedame prie įprastų pardavimų
				regularSales.push(dayData.totalQuantity);
			} else {
				// Jei yra akcijų, pridedame pardavimus prie kiekvieno akcijos tipo
				dayData.promoTypes.forEach(promoType => {
					if (!promoSalesByType.has(promoType)) {
						promoSalesByType.set(promoType, []);
					}
					promoSalesByType.get(promoType)!.push(dayData.totalQuantity);
				});
			}
		});

		return { regularSales, promoSalesByType };
	}

    private calculateSalesMetrics(sales: number[]): SalesMetrics {
        if (sales.length === 0) {
            return { mean: 0, median: 0, stdDev: 0 };
        }

        return {
            mean: Number(mean(sales).toFixed(2)),
            median: Number(median(sales).toFixed(2)),
            stdDev: Number(standardDeviation(sales).toFixed(2))
        };
    }

    private calculatePromoTypeMetrics(
        promoSalesByType: Map<number, number[]>,
        totalDays: number,
        regularMean: number
    ): PromoTypeMetrics[] {
        const metrics: PromoTypeMetrics[] = [];

        promoSalesByType.forEach((sales, promoType) => {
            // Skaičiuojame metrikas konkrečiam promo tipui
            const salesMetrics = this.calculateSalesMetrics(sales);
            const frequency = (sales.length / totalDays) * 100;
            const uplift = salesMetrics.mean / regularMean;

            metrics.push({
                type: promoType,
                uplift: Number(uplift.toFixed(2)),
                frequency: Number(frequency.toFixed(1)),
                mean: salesMetrics.mean,
                median: salesMetrics.median,
                stdDev: salesMetrics.stdDev
            });
        });

        return metrics.sort((a, b) => a.type - b.type);
    }

    private calculateStockLevels(
        regularMetrics: SalesMetrics,
        promoMetrics: SalesMetrics,
        stockoutRate: StockoutMetrics,
        reliability: 'Low' | 'Medium' | 'High',
        promoFrequency: number,
        options: BufferCalculationOptions = { confidenceLevel: 80 }
    ) {
        // Minimalus kiekis lygus vidutiniams pardavimams
        let minQuantity = Math.max(
            this.BASE_MINIMUM,
            Math.ceil(regularMetrics.mean)
        );

        // Buferis su nurodytu patikimumo lygiu
        let buffer = this.calculateBuffer(regularMetrics, options);

        // Promo buferis
        let promoBuffer = this.calculatePromoBuffer(
            regularMetrics,
            promoMetrics,
            stockoutRate.promo,
            promoFrequency
        );

        return { 
            minQuantity: Math.round(minQuantity), 
            buffer: Math.round(buffer), 
            promoBuffer: Math.round(promoBuffer) 
        };
    }

    private calculateBuffer(metrics: SalesMetrics, options: BufferCalculationOptions): number {
        const { confidenceLevel = 80 } = options;
        const zScore = this.CONFIDENCE_LEVELS[confidenceLevel] || this.CONFIDENCE_LEVELS[80]; // default to 80% if nepateiktas arba neteisingas
        return Math.ceil(metrics.stdDev * zScore);
    }

    private calculatePromoBuffer(
        regularMetrics: SalesMetrics,
        promoMetrics: SalesMetrics,
        promoStockoutRate: number,
        promoFrequency: number
    ): number {
        if (promoFrequency === 0 || promoMetrics.mean === 0) return 0;

        const additionalPromoNeed = regularMetrics.mean * 
            ((promoMetrics.mean / regularMetrics.mean) - 1);
        
        return additionalPromoNeed * this.PROMO_UPLIFT_SAFETY;
    }

    private calculateBufferRatios(
		regularMean: number,
		minQuantity: number,
		buffer: number,
		promoBuffer: number,
		promoUplift: number,
		promoFrequency: number
	): BufferMetrics {
		return {
			baseRatio: regularMean > 0 ? 
				Number(((minQuantity - regularMean) / regularMean).toFixed(2)) : 0,  // Pataisytas skaičiavimas
			bufferRatio: regularMean > 0 ? 
				Number((buffer / regularMean).toFixed(2)) : 0,
			promoBufferRatio: regularMean > 0 ? 
				Number((promoBuffer / regularMean).toFixed(2)) : 0,
			promoUplift: Number(promoUplift.toFixed(2)),
			promoFrequency: Number(promoFrequency.toFixed(1))
		};
	}
		
	private analyzeTimePeriods(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): TimePeriodsAnalysis {
        return {
            daily: this.analyzePeriodMetrics(dailyData, options),
            workdays: this.analyzeWorkdayMetrics(dailyData, options),
            weekends: this.analyzeWeekendMetrics(dailyData, options),
            weekly: this.analyzeWeeklyMetrics(dailyData, options),
            biweekly: this.analyzeBiweeklyMetrics(dailyData, options),
            monthly: this.analyzeMonthlyMetrics(dailyData, options)
        };
    }

	private analyzeWorkdayMetrics(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): StockMetrics {
		// Sukuriame naują Map objektą su filtruotais duomenimis
		const workdayData = new Map(
			Array.from(dailyData)
				.filter(([date]) => {
					const day = new Date(date).getDay();
					return day >= 1 && day <= 5;
				})
		);
		return this.analyzePeriodMetrics(workdayData, options);
	}

	private analyzeWeekendMetrics(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): StockMetrics {
		// Sukuriame naują Map objektą su filtruotais duomenimis
		const weekendData = new Map(
			Array.from(dailyData)
				.filter(([date]) => {
					const day = new Date(date).getDay();
					return day === 0 || day === 6;
				})
		);
		return this.analyzePeriodMetrics(weekendData, options);
	}

	private analyzeWeeklyMetrics(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): StockMetrics {
		return this.analyzeGroupedMetrics(dailyData, 7, options);
	}

	private analyzeBiweeklyMetrics(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): StockMetrics {
		return this.analyzeGroupedMetrics(dailyData, 14, options);
	}

	private analyzeMonthlyMetrics(dailyData: Map<string, DailySalesData>, options: BufferCalculationOptions): StockMetrics {
		return this.analyzeGroupedMetrics(dailyData, 30, options);
	}

	private analyzeGroupedMetrics(
		dailyData: Map<string, DailySalesData>, 
		periodDays: number,
		options: BufferCalculationOptions
	): StockMetrics {
		const sortedDates = Array.from(dailyData.keys()).sort();
		const groupedData = new Map<string, DailySalesData>();
		
		for (let i = 0; i < sortedDates.length; i += periodDays) {
			const periodDates = sortedDates.slice(i, i + periodDays);
			const periodSales = {
				totalQuantity: periodDates
					.map(date => dailyData.get(date)!)
					.reduce((sum, data) => sum + data.totalQuantity, 0),
				hasStockout: periodDates
					.some(date => dailyData.get(date)!.hasStockout),
				promoTypes: this.getAllPromoTypesInPeriod(
					periodDates.map(date => dailyData.get(date)!)
				)
			};
				
			groupedData.set(sortedDates[i], periodSales);
		}
		
		return this.analyzePeriodMetrics(groupedData, options);
	}
	
	private getAllPromoTypesInPeriod(data: DailySalesData[]): number[] {
		const uniquePromoTypes = new Set<number>();
		
		data.forEach(dayData => {
			dayData.promoTypes.forEach(promoType => {
				uniquePromoTypes.add(promoType);
			});
		});
		
		return Array.from(uniquePromoTypes);
	}
	
	private getDominantPromoType(data: DailySalesData[]): number {
		const promoCount = new Map<number, number>();
		
		data.forEach(d => {
			d.promoTypes.forEach(promoType => {
				if (promoType > 0) {
					promoCount.set(promoType, (promoCount.get(promoType) || 0) + 1);
				}
			});
		});
		
		let dominantType = 0;
		let maxCount = 0;
		
		Array.from(promoCount.entries()).forEach(([type, count]) => {
			if (count > maxCount) {
				maxCount = count;
				dominantType = type;
			}
		});
		
		return dominantType;
	}

	private calculatePeriodReliability(periodData: Map<string, DailySalesData>): DataQualityMetrics {
		const uniqueDays = periodData.size;
		const totalOrders = Array.from(periodData.values()).length;
		const totalQuantity = Array.from(periodData.values())
			.reduce((sum, data) => sum + data.totalQuantity, 0);
		
		let reliability: 'Low' | 'Medium' | 'High';		
		
		// Vidutinių užsakymų per dieną skaičiavimas
		const averageOrdersPerDay = totalOrders / uniqueDays;

		if (uniqueDays < this.MIN_UNIQUE_DAYS || totalOrders < this.MIN_ORDERS) {
			reliability = 'Low';
		} 
		else if (uniqueDays < this.MIN_UNIQUE_DAYS * 1.5 || totalOrders < this.MIN_ORDERS * 1.5) {
			reliability = 'Medium';
		}
		else {
			reliability = 'High';
		}
		
		return {
			uniqueDays,
			totalOrders,
			totalQuantity,
			averageOrdersPerDay,
			reliability
		};
	}	
	
	private analyzePeriodMetrics(periodData: Map<string, DailySalesData>, options: BufferCalculationOptions = { confidenceLevel: 80 }): StockMetrics {
		const { regularSales, promoSalesByType } = this.splitSalesByType(periodData);
		
		const regularMetrics = this.calculateSalesMetrics(regularSales);
		const promoTypeMetrics = this.calculatePromoTypeMetrics(
			promoSalesByType,
			periodData.size,
			regularMetrics.mean
		);
		
		const allPromoSales = Array.from(promoSalesByType.values()).flat();
		const promoMetrics = this.calculateSalesMetrics(allPromoSales);
		
		const stockoutRate = {
			regular: this.calculateStockoutRate(regularSales),
			promo: this.calculateStockoutRate(allPromoSales)
		};
		
		const reliabilityMetrics = this.calculatePeriodReliability(periodData);

		const { minQuantity, buffer, promoBuffer } = this.calculateStockLevels(
			regularMetrics,
			promoMetrics,
			stockoutRate,
			reliabilityMetrics.reliability,
			promoTypeMetrics.reduce((sum, m) => sum + m.frequency, 0) / 100,
			options
		);

		const weightedPromoUplift = promoTypeMetrics.reduce(
			(sum, metrics) => sum + (metrics.uplift * (metrics.frequency / 100)),
			0
		);

		const bufferMetrics = this.calculateBufferRatios(
			regularMetrics.mean,
			minQuantity,
			buffer,
			promoBuffer,
			weightedPromoUplift,
			promoTypeMetrics.reduce((sum, m) => sum + m.frequency, 0)
		);
		
		return {
			regularSales: regularMetrics,
			promoSales: promoMetrics,
			promoMetrics: promoTypeMetrics,
			stockoutRate,
			dataQuality: reliabilityMetrics,
			bufferMetrics,
			stockLevels: {  // Naujas stockLevels objektas
				minQuantity,
				buffer,
				promoBuffer,
				totalStock: minQuantity + buffer + promoBuffer
			}
		};
	}

    private calculateStockoutRate(sales: number[]): number {
        if (sales.length === 0) return 0;
        return sales.filter(s => s === 0).length / sales.length;
    }
  
}

export default StockAnalyzer;