class Country {
    constructor(id) {
      this._id = id;
      this._name = "";
      this._code = "";
      this._holidays = [];
      this._context = null;
    }
     async load(context) {
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
     get name() {
      return this._name;
    }
     set name(value) {
      this._name = value;
    }
     get code() {
      return this._code;
    }
     set code(value) {
      this._code = value;
    }
     get id() {
      return this._id;
    }
     get holidays() {
      return this._holidays;
    }
     static async isPublicHoliday(country_id, date, context) {
      let ans = false;
      const schema = await context.getSchema();
      const { ItemsService } = context.services;
      let dateString = date.toISOString().split("T")[0];
      let countryService = new ItemsService("country", { schema: schema });
      let country = await countryService.readOne(country_id, { fields: ["*.*"] });
      country.public_holidays.forEach((holiday) => {
        if (holiday.holiday_date == dateString) {
          ans = true;
        }
      });
       return ans;
    }
     isPublicHoliday(date) {
      let dateString = date.toISOString().split("T")[0];
      let ans = false;
      for (let i = 0; i < this._holidays.length; i++) {
        if (this._holidays[i].holiday_date == dateString) {
          ans = true;
          break;
        }
      }
      return ans;
    }

    static async retrieveCountryByCode(countryCode,ItemsService,schema){
        let countryService = new ItemsService("country",{schema:schema});
        let countryData = await countryService.readByQuery({filter:{country_code:countryCode}});
        let country;
        if(countryData.length==0){
            let newCountry = await countryService.createOne({country_code:countryCode});
            country = ({country_code:countryCode,id:newCountry});
        }
        else{
            country = countryData[0];
        }
        return country;

    }
  }
  
   export default Country;