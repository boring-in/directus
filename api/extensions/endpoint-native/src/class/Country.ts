class Country {
    private _id: number;
    private _name?: string;
    private _code?: string;
    private _context?: any;
    private _holidays?: Array<{date: string}>;

    constructor(id: number) {
        this._id = id;
    }

    // --async function, that loads all of the data for object from db. Must be used after creating an object , using *await*--
    async load(context: any): Promise<void> {
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

    get name(): string | undefined {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
    }

    get code(): string | undefined {
        return this._code;
    }

    set code(value: string) {
        this._code = value;
    }

    get id(): number {
        return this._id;
    }

    get holidays(): Array<{date: string}> | undefined {
        return this._holidays;
    }

    //-- checks if date is public holiday in given country
    static async isPublicHoliday(
        country_id: number, 
        date: Date, 
        context: any
    ): Promise<boolean> {
        let ans = false;
        const schema = await context.getSchema();
        const { ItemsService } = context.services;
        let dateString = date.toISOString().split("T")[0];
        let countryService = new ItemsService("country", { schema: schema });
        let country = await countryService.readOne(country_id, { fields: ["*.*"] });
        
        country.public_holidays.forEach((holiday: {date: string}) => {
            if (holiday.date == dateString) {
                ans = true;
            }
        });
        
        return ans;
    }

    //-- checks if date is public holiday in this country
    isPublicHoliday(date: Date): boolean {
        let dateString = date.toISOString().split("T")[0];
        let ans = false;
        
        for (let i = 0; i < (this._holidays || []).length; i++) {
            if ((this._holidays as Array<{date: string}>)[i].date == dateString) {
                ans = true;
                break;
            }
        }
        
        return ans;
    }

    static async retrieveCountryByCode(
        countryCode: string, 
        ItemsService: any, 
        schema: any
    ): Promise<{country_code: string, id: number}> {
        let countryService = new ItemsService("country", {schema});
        //console.log("countryCode: " + countryCode);
        
        let countryData = await countryService.readByQuery({filter:{country_code:countryCode}});
       // console.log("countryData: ");
       // console.log(countryData);
        
        let country: {country_code: string, id: number};
        
        if(countryData.length == 0){
            let newCountry = await countryService.createOne({country_code:countryCode});
            country = {country_code:countryCode, id:newCountry};
        }
        else{
            country = countryData[0];
        }
      
        return country;
    }
}

export default Country;