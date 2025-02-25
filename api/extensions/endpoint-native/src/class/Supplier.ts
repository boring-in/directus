import Country from "./Country";
import CalculationsHelper from "./CalculationsHelper";
import Log from "./Log";

// Interfaces for data structures
interface SupplierData {
    supplier_name: string;
    supplier_country: {
        id: number;
    };
    supply_freq_type: string;
    weekly?: Array<{
        delivery_days: number;
    }>;
    monthly?: Array<{
        delivery_days: number;
    }>;
    delivery_days?: number;
}

interface SupplyFreqData {
    day: number;
    delivery_days: number;
    order_time: string;
    week_day?: number;
    month_day?: number;
}

interface OrderDateResult {
    date: Date;
    delivery_days: number;
}

interface Context {
    getSchema: () => Promise<any>;
    services: {
        ItemsService: new (name: string, options: { schema: any }) => any;
    };
    database: {
        raw: (query: string) => Promise<any>;
    };
}

class Supplier {
    private _id: number;
    private _context!: Context;
    private _name!: string;
    private _countryId!: number;
    private _supplyFreqType!: string;
    private _deliveryDays!: number;
    private _Country?: Country;
    private _supplyFreqMonthly?: any;
    private _supplyFreqWeekly?: any;

    constructor(id: number) {
        this._id = id;
    }

    /**
     * Async function that loads all of the data for object from db.
     * Must be used after creating an object, using *await*
     */
    async load(context: Context): Promise<void> {
        this._context = context;
        const supplierData: SupplierData = await this.getData("*.*.*");
        
        this._name = supplierData.supplier_name;
        this._countryId = supplierData.supplier_country.id;
        this._supplyFreqType = supplierData.supply_freq_type;

        switch (this._supplyFreqType) {
            case "weekly":
                this._deliveryDays = supplierData.weekly?.[0].delivery_days ?? 0;
                break;
            case "monthly":
                this._deliveryDays = supplierData.monthly?.[0].delivery_days ?? 0;
                break;
            default:
                this._deliveryDays = supplierData.delivery_days ?? 0;
                break;
        }
    }

    /**
     * Loads supplier item data from database
     */
    async getData(query: string): Promise<any> {
        const newSchema = await this._context.getSchema();
        const { ItemsService } = this._context.services;
        const supplierService = new ItemsService("supplier", { schema: newSchema });
        const supplierData = await supplierService.readOne(this._id, {
            fields: [query],
        });
        return supplierData;
    }

    async getDataDirect(query: string): Promise<any[]> {
        await this._context.getSchema();
        const database = this._context.database;
        const supplierData = await database.raw(`${query}`);
        const computedData: any[] = [];

        if (supplierData.rows != null && supplierData.rows !== undefined) {
            return supplierData.rows;
        } else {
            const rows = supplierData[0];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const jsonString = JSON.stringify(row);
                const jsonObject = JSON.parse(jsonString);
                computedData.push(jsonObject);
            }
        }
        return computedData;
    }

    get id(): number {
        return this._id;
    }

    get name(): string {
        return this._name;
    }

    get Country(): Promise<Country> {
        return this.getCountry();
    }

    /**
     * Gets suppliers country
     */
    async getCountry(): Promise<Country> {
        if (!this._Country) {
            this._Country = new Country(this._countryId);
            await this._Country.load(this._context);
        }
        return this._Country;
    }

    get supplyFreqType(): string {
        return this._supplyFreqType;
    }

    get deliveryDays(): number {
        return this._deliveryDays;
    }

    get countryId(): number {
        return this._countryId;
    }

    /**
     * Entry point for calculating nearest order date for this supplier
     */
    async getNextOrderDate(date: Date): Promise<OrderDateResult> {
        switch (this._supplyFreqType) {
            case "on demand":
                return { date: date, delivery_days: this._deliveryDays };
            case "weekly":
            case "monthly":
                const data = await this.getNextOrderDateByType(date);
                return {
                    date: data.foundDate,
                    delivery_days: data.deliveryDays,
                };
            default:
                throw new Error("Invalid supply frequency type");
        }
    }

    async getNextOrderDateByType(date: Date): Promise<{ foundDate: Date; deliveryDays: number }> {
        await this.getCountry();
        await this.getSupplyFreqData();
        const calculationsHelper = new CalculationsHelper();
        const dayCount = this._supplyFreqType === "weekly" 
            ? 7 
            : this.getDaysInMonth(date.getMonth(), date.getFullYear());

        // Filter data
        let supplierDataArray: SupplyFreqData[];
        if (this._supplyFreqType === "weekly") {
            supplierDataArray = await this.getDataDirect(
                `SELECT * FROM supply_freq_weekly WHERE supplier = ${this._id} ORDER BY week_day ASC`
            );
            for (let i = 0; i < supplierDataArray.length; i++) {
                supplierDataArray[i].day = supplierDataArray[i].week_day!;
            }
        } else {
            supplierDataArray = await this.getDataDirect(
                `SELECT * FROM supply_freq_monthly WHERE supplier = ${this._id} ORDER BY month_day ASC`
            );
            for (let i = 0; i < supplierDataArray.length; i++) {
                supplierDataArray[i].day = supplierDataArray[i].month_day!;
            }
        }

        const calculatedData = calculationsHelper.calculateMinDate(date, supplierDataArray, dayCount, 1);

        // Note: The following loop appears to be dead code in the original JS
        // Keeping it for compatibility but marking it as such
        for (let i = 0; i < calculatedData.length; i++) {
            while (false) {
                // @ts-ignore - Dead code from original implementation
                if (this._Country.isPublicHoliday(calculatedData[i].foundDate) &&
                    !this.isWorkDay(calculatedData[i].foundDate));
                else {
                    // @ts-ignore - Dead code from original implementation
                    calculatedData[i].foundDate.setDate(orderDate.getDate() - 1);
                }
            }
        }

        return calculatedData[0];
    }

    /**
     * Calculates nearest possible date from given date and supplier order data
     */
    private getMinDate(supplierData: any, date: Date): number {
        let supplierDataArray;
        let a: number;
        let minDate = 0;
        let currentDay: number;
        const freqType = this._supplyFreqType;
        const bufferDate = new Date(date);
        let found = false;
        let deliveryDays = 0;

        if (freqType === "weekly") {
            supplierDataArray = supplierData.weekly;
            currentDay = date.getUTCDay();
            if (currentDay === 0) {
                currentDay = 7;
            }
            a = 7;
        } else {
            supplierDataArray = supplierData.monthly;
            currentDay = date.getDate();
            a = this.getDaysInMonth(date.getMonth(), date.getFullYear());
        }

        while (!found) {
            let dayDifference: number;
            supplierDataArray.forEach((item: any) => {
                const orderTime = item.order_time.split(":");
                let itemFreqTypeDay: number;

                if (freqType === "weekly") {
                    itemFreqTypeDay = item.week_day;
                    currentDay = bufferDate.getUTCDay();
                } else {
                    itemFreqTypeDay = item.month_day;
                    currentDay = bufferDate.getDate();
                }

                if (itemFreqTypeDay >= currentDay) {
                    dayDifference = itemFreqTypeDay - currentDay;
                } else {
                    dayDifference = a - currentDay + itemFreqTypeDay;
                }

                const orderDate = new Date(bufferDate);
                orderDate.setDate(bufferDate.getDate() + dayDifference);
                orderDate.setHours(parseInt(orderTime[0]), parseInt(orderTime[1]), parseInt(orderTime[2]));

                if (bufferDate.getTime() > orderDate.getTime());

                if (minDate === 0 ||
                    (minDate > orderDate.getTime() &&
                        bufferDate.getTime() < orderDate.getTime())) {
                    minDate = orderDate.getTime();
                    deliveryDays = item.delivery_days;
                }
            });

            if (minDate < bufferDate.getTime()) {
                bufferDate.setDate(bufferDate.getDate() + 1);
                minDate = 0;
            } else {
                found = true;
            }
        }

        this._deliveryDays = deliveryDays;
        return minDate;
    }

    /**
     * Checks if given day is work day
     */
    private isWorkDay(checkDate: Date): boolean {
        return !(checkDate.getUTCDay() === 0 || checkDate.getUTCDay() === 6);
    }

    /**
     * Checks how often supplier takes orders, either weekly, monthly or on demand
     */
    private async getSupplyFreqData(): Promise<any> {
        if (!this._supplyFreqMonthly &&
            !this._supplyFreqWeekly &&
            !this._deliveryDays) {
            const supplierData = await this.getData(`${this._supplyFreqType}.*`);
            if (this._supplyFreqType === "weekly") {
                this._supplyFreqWeekly = supplierData;
            } else {
                this._supplyFreqMonthly = supplierData;
            }
        }
        return this._supplyFreqType === "weekly"
            ? this._supplyFreqWeekly
            : this._supplyFreqMonthly;
    }

    /**
     * Returns how many days there are in given month
     */
    private getDaysInMonth(month: number, year: number): number {
        return new Date(year, month + 1, 0).getDate();
    }
}

export default Supplier;
