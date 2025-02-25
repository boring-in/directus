/**
 * Represents a country entity with holiday information and database integration.
 */

// Types for the internal data structures
interface Holiday {
    holiday_date: string;
    [key: string]: any; // For any additional holiday properties
}

interface CountryData {
    country_name: string;
    country_code: string;
    public_holidays: Holiday[];
    id: string | number;
}

interface Context {
    getSchema: () => Promise<any>;
    services: {
        ItemsService: ItemsServiceConstructor;
    };
}

// Interface for ItemsService to avoid circular reference
interface ItemsServiceConstructor {
    new (collection: string, options: { schema: any }): ItemsService;
}

interface ItemsService {
    readOne(id: string | number, options: { fields: string[] }): Promise<CountryData>;
    readByQuery(options: { filter: { country_code: string } }): Promise<CountryData[]>;
    createOne(data: { country_code: string }): Promise<string | number>;
}

class Country {
    private _id: string | number;
    private _name: string;
    private _code: string;
    private _holidays: Holiday[];
    private _context: Context | null;

    constructor(id: string | number) {
        this._id = id;
        this._name = "";
        this._code = "";
        this._holidays = [];
        this._context = null;
    }

    /**
     * Loads country data from the database using the provided context.
     * @param context - The context object containing schema and services.
     */
    async load(context: Context): Promise<void> {
        this._context = context;
        let schema = await this._context.getSchema();
        const { ItemsService } = this._context.services;
        let countryService = new ItemsService("country", { schema: schema });
        let countryData = await countryService.readOne(this._id, {
            fields: ["*.*"],
        });
        this._name = countryData.country_name;
        this._code = countryData.country_code;
        this._holidays = countryData.public_holidays;
    }

    get name(): string {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
    }

    get code(): string {
        return this._code;
    }

    set code(value: string) {
        this._code = value;
    }

    get id(): string | number {
        return this._id;
    }

    get holidays(): Holiday[] {
        return this._holidays;
    }

    /**
     * Checks if a given date is a public holiday for a specific country.
     * @param country_id - The ID of the country to check.
     * @param date - The date to check.
     * @param context - The context object containing schema and services.
     * @returns Promise<boolean> - True if the date is a public holiday, false otherwise.
     */
    static async isPublicHoliday(
        country_id: string | number,
        date: Date,
        context: Context
    ): Promise<boolean> {
        let ans = false;
        const schema = await context.getSchema();
        const { ItemsService } = context.services;
        let dateString = date.toISOString().split("T")[0];
        let countryService = new ItemsService("country", { schema: schema });
        let country = await countryService.readOne(country_id, { fields: ["*.*"] });
        
        if (country && country.public_holidays) {
            country.public_holidays.forEach((holiday) => {
                if (holiday && holiday.holiday_date === dateString) {
                    ans = true;
                }
            });
        }

        return ans;
    }

    /**
     * Checks if a given date is a public holiday for this country instance.
     * @param date - The date to check.
     * @returns boolean - True if the date is a public holiday, false otherwise.
     */
    isPublicHoliday(date: Date): boolean {
        let dateString = date.toISOString().split("T")[0];
        let ans = false;
        for (let i = 0; i < this._holidays.length; i++) {
            const holiday = this._holidays[i];
            if (holiday && holiday.holiday_date === dateString) {
                ans = true;
                break;
            }
        }
        return ans;
    }

    /**
     * Retrieves or creates a country by its country code.
     * @param countryCode - The country code to look up.
     * @param ItemsService - The ItemsService constructor.
     * @param schema - The database schema.
     * @returns Promise<CountryData> - The found or created country data.
     */
    static async retrieveCountryByCode(
        countryCode: string,
        ItemsService: ItemsServiceConstructor,
        schema: any
    ): Promise<CountryData> {
        let countryService = new ItemsService("country", { schema: schema });
        let countryData = await countryService.readByQuery({ filter: { country_code: countryCode } });
        
        // Create default country data if none exists
        if (countryData.length === 0) {
            let newCountry = await countryService.createOne({ country_code: countryCode });
            return {
                country_code: countryCode,
                id: newCountry,
                country_name: '',
                public_holidays: []
            };
        }
        
        // Ensure we have valid country data
        const country = countryData[0];
        if (!country) {
            // If for some reason the first item is undefined, return a default object
            return {
                country_code: countryCode,
                id: '',
                country_name: '',
                public_holidays: []
            };
        }
        
        return country;
    }
}

export default Country;
