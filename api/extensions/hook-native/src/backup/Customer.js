import Address from "../model/Address";
import Country from "../model/Country";
class Customer {
  constructor(
    salesChannelId,
    firstName,
    lastName,
    email,
    country,
    city,
    address,
    postcode,
    ItemsService,
    schema
  ) {
    this.salesChannelId = salesChannelId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;

    this.customerService = new ItemsService("customers", { schema: schema });
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async getCustomer() {
    let countryData = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );

    let adr = new Address(
      countryData,
      this.city,
      this.address,
      this.postcode,
      this.ItemsService,
      this.schema
    );
    let addressData = await adr.getAddress();

    let customerData = await this.customerService.readByQuery({
      filter: { email: this.email },
    });
    let customer;

    if (customerData.length == 0) {
      let parentCustomer = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        address: addressData.id,
      });
      let customerId = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        address: addressData.id,
        parent_customer: parentCustomer,
      });
      customer = {
        id: customerId,
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        address: addressData.id,
        parent_customer: parentCustomer,
      };
    } else {
      let foundCustomer = customerData.find(
        (item) => item.sales_channel == this.salesChannelId
      );
      if (foundCustomer == undefined) {
        let parentCustomer = customerData.find(
          (item) => item.parent_customer == null
        );
        let customerId = await this.customerService.createOne({
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          address: addressData.id,
          parent_customer: parentCustomer.id,
        });
        customer = {
          id: customerId,
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          address: addressData.id,
          parent_customer: parentCustomer.id,
        };
      } else {
        customer = foundCustomer;
      }
    }
    return customer;
  }
}
export default Customer;
