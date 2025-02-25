import Country from "./Country";
class Address {
  country;
  city;
  address;
  postcode;

  constructor(country, city, address, postcode, ItemsService, schema) {
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;
    (this.ItemsService = ItemsService),
      (this.schema = schema),
      (this.addressService = new ItemsService("address", { schema: schema }));
  }

  async getAddress() {
    let address;

    let country = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );
    let addressData = await this.addressService.readByQuery({
      filter: {
        _and: [
          { country: country.id },
          { city: this.city },
          { address: this.address },
          { zip_postal_code: this.postcode },
        ],
      },
    });

    console.log(addressData);
    if (addressData.length == 0) {
      address = await this.createAddress();
    } else {
      address = addressData[0];
    }
    return address;
  }

  async createAddress() {
    let country = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );
    let newAddressId = await this.addressService.createOne({
      country: country,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
    });
    return {
      country: country.id,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
      id: newAddressId,
    };
  }
}
export default Address;
