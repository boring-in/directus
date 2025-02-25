import axios from 'axios';
import DataProvider from '../../class/DataProvider';
import DataWriter from '../../class/DataWriter';
class Holidays{
    _context;
    constructor(context) {
        this._context=context;
        this._getSchema = this._context.getSchema;
    }

	async import(code , year = null){
		let dataWriter = new DataWriter(this._context);
		let dataProvider = new DataProvider(this._context);
		if(!year){
			year = new Date().getFullYear();
		}
		let country = await dataProvider.getCountryByCode(code);
		let holidays = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`);
		console.log(holidays.data);
		holidays.data.forEach(async (holiday) => {
			await dataWriter.persistHoliday( country.id,holiday.date, holiday.name,holiday.types[0]);
		});


		

		

	}

    async byCountryCode(countryCode){
        let ItemsService = this._context.services;
        let schema = await this._getSchema();
        let holidayService = new ItemsService('public_holidays',{schema:schema})
		let countryService = new ItemsService('country',{schema:schema});


		//let countryCode = req.params.countryCode;
		let year = new Date().getFullYear();

		let countryArray = new Array();
		countryArray = await countryService.readByQuery({country_code:countryCode});

		let country = await countryArray.find(country => country.country_code == countryCode);
		let countryId = country.id;
		console.log(await countryId);


		axios.get(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`)
			.then(response => {
				var allData = response.data;
				allData.forEach( async function(item){
					console.log(item)
					var holiday = holidayService.readByQuery({country:countryId,holiday_date:item.date})
					console.log(holiday);
					if (!holiday[0]){
						holidayService.createOne({
							country:countryId,
							holiday_date:item.date,
							holiday_name_english:item.name,
							holiday_type:item.types
						})
							.then((result) =>{
								//console.log(result)
							})
							.catch((err)=>{
								console.log(err)
							});
					}
				})
				
			})
			.catch(err =>{
				//console.log(err);
			});
            }


    async byCountryCodeAndYear(countryCode,year){
        let ItemsService = this._context.services;
        let schema = await this._getSchema();
        let holidayService = new ItemsService('public_holidays',{schema:schema})
      
		let countryService = new ItemsService('country',{schema:schema});



		//let countryCode = req.params.countryCode;
		//let year = req.params.year;
		let countryArray = new Array();
		 countryArray = await countryService.readByQuery({country_code:countryCode});

		let country = await countryArray.find(country => country.country_code == countryCode);
		let countryId = country.id;
		console.log(await country);

		console.log(await countryId);
		axios.get(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`)
			.then(response => {
				var allData = response.data;
				allData.forEach(async function  (item){
					//console.log(item)
					var holiday = await holidayService.readByQuery({filter:{id:countryId,holiday_date:item.date}})
					//console.log(holiday[0]);
					if (!holiday[0]){
						holidayService.createOne({
							country:countryId,
							holiday_date:item.date,
							holiday_name_english:item.name,
							holiday_type:item.types
						})
							.then((result) =>{
								//console.log(result)
							})
							.catch((err)=>{
								console.log(err);
							});
					}

				})
				
			})
			.catch(err =>{
			//	console.log(err);
			});

        }

} export default Holidays;