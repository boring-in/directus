class CalculationsHelper {
    timeCache: { [key: number]: number[] } = {};
    supplier: any; // Replace with more specific type if possible

    async dateCalc(dayCount: number, currentDate: Date, supplier: any): Promise<number[]> { //TODO ateityje atskirti nuo kitu klasiu 
        let ans: number[] = [];
        let date = new Date(currentDate);
        
        if (this.timeCache[dayCount] == null) {
            let r1 = date.setDate(date.getDate() + dayCount);
            let m0 = await supplier.getNextOrderDate(new Date(r1));
    
            let deliveryDate = new Date();
            //  deliveryDate.setDate(deliveryDate.getDate() + m1);
    
            deliveryDate = addDays(m0.date.toString(), m0.delivery_days);
            let timeDifference = deliveryDate.getTime() - currentDate.getTime();
            let m1 = Math.ceil(timeDifference / (1000 * 3600 * 24));
            ans[0] = m1;
            let r2 = new Date(deliveryDate);
            r2.setDate(r2.getDate() + dayCount);
            let m01 = await this.supplier.getNextOrderDate(new Date(r2));
            let secondDeliveryDate = new Date();
            secondDeliveryDate = addDays(m01.date.toString(), m01.delivery_days);
            let timeDifference2 =
                secondDeliveryDate.getTime() - deliveryDate.getTime();
            // let deliveryDate1 = new Date();
            // deliveryDate1.setDate(deliveryDate1.getDate() + m11);
            let m11 = Math.ceil(timeDifference2 / (1000 * 3600 * 24));
            ans[1] = m11;
            this.timeCache[dayCount] = ans;
        } else {
            ans = this.timeCache[dayCount];
        }
        
        function addDays(date: string, days: number): Date {
            const newDate = new Date(date);
            newDate.setDate(newDate.getDate() + days);
            return newDate;
        }
        return ans;
    }

    calculateMinDate(
        date: Date, 
        filteredData: Array<{
            day: number, 
            order_time: string, 
            delivery_days: number
        }>, 
        dayCount: number, 
        dateCount: number
    ): Array<{foundDate: Date, deliveryDays: number}> {
        let currentDay = (dayCount == 7) ? date.getDay() : date.getDate();
        let currentTime = date.getTime();
        let dayDifference = 0;
        let index = 0;
        let supplyQuantity = 0;
        let found = false;
        let period = 0;
        let foundDates: Array<{foundDate: Date, deliveryDays: number}> = [];
        
        while (supplyQuantity != dateCount) {
            if ((currentDay < filteredData[index].day) || (currentDay == filteredData[index].day && filteredData[index].order_time > currentTime.toString())) 
                found = true;
            
            if (found) {
                dayDifference = filteredData[index].day - currentDay;
                if (period == 0)
                    dayDifference = dayDifference < 0 ? dayCount + dayDifference : dayDifference;
                else
                    dayDifference = period + dayDifference;
                
                supplyQuantity++;
                
                let foundDate = new Date(date);
                foundDate.setDate(date.getDate() + dayDifference);
                
                let orderHours = filteredData[index].order_time.split(":");
                foundDate.setHours(parseInt(orderHours[0]), parseInt(orderHours[1]), parseInt(orderHours[2]));
                
                foundDates.push({ foundDate: foundDate, deliveryDays: filteredData[index].delivery_days });
            }
            
            index++;
            if (index > filteredData.length - 1) {
                index = 0;
                found = true;
                if (dayCount == 7)
                    period += 7;
                else
                    period += this.totalMothlyDayDifference(date, period, dayCount);
            }
        }
   
        return foundDates;
    }

    totalMothlyDayDifference(date: Date, period: number, dayCount: number): number {
        let buffDate = new Date(date);
        buffDate.setDate(date.getDate() + period);
        let days = new Date(buffDate.getFullYear(), buffDate.getMonth() + 1, 0).getDate();
        return days;
    }

    recalcStockNeededBetweenOrders(purchaseItem: {
        remaining_stock_after_second_arrival: number,
        stock_needed_between_orders: number,
        total_variant_order_quantity: number
    }): number {
        let result = 0;
        
        if (purchaseItem.remaining_stock_after_second_arrival < 0) {
            result = Math.ceil(purchaseItem.remaining_stock_after_second_arrival * -1);
        }
        
        purchaseItem.stock_needed_between_orders = result;
        purchaseItem.total_variant_order_quantity = result;
        
        return result;
    }

    recursiveFinalTotalQuantityCalculation(
        warehouseMap: Map<any, {
            purchaseData: Map<any, {
                total_variant_order_quantity: number,
                remaining_stock_after_second_arrival: number
            }>
        }>, 
        warehouseHierarchyTree: Map<any, Map<any, any>>, 
        parentId: any = null
    ): Map<any, any> {
        warehouseHierarchyTree.forEach((value, key) => {
            this.recursiveFinalTotalQuantityCalculation(warehouseMap, value, key);
            
            if (parentId != null) {
                if (warehouseMap.has(key)) {
                    if(warehouseMap.get(key)!.purchaseData.size > 0){
                        warehouseMap.get(key)!.purchaseData.forEach((purchaseItem, productId) => {
                            if (warehouseMap.get(parentId)!.purchaseData.has(productId)) {
                                const parentPurchaseItem = warehouseMap.get(parentId)!.purchaseData.get(productId)!;
                                
                                parentPurchaseItem.remaining_stock_after_second_arrival -= purchaseItem.total_variant_order_quantity;
                                parentPurchaseItem.total_variant_order_quantity += purchaseItem.total_variant_order_quantity;
                            }
                        });
                    }
                }
            }
        });
        
        return warehouseMap;
    }
}

export default CalculationsHelper;