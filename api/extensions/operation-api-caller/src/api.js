import axios from "axios";

export default {
	id: 'api_caller_2.0',
	handler: async ({ endpoint, body, response, token, is_local_endpoint }, { env }) => {
		//axios.defaults.headers.common = {'Authorization': `bearer ${token}`}
		const public_url = env.PUBLIC_URL;
		if (is_local_endpoint && !public_url) {
			throw new Error('PUBLIC_URL environment variable is required for local endpoints');
		}
		const full_endpoint = is_local_endpoint ? `${public_url}${endpoint}` : endpoint;
		console.log(full_endpoint);
		console.log(public_url)
		if (body != null) {
			response = await axios.post(full_endpoint, body);
			console.log(response.data);
			
		}
		else {
		response = await axios.get(full_endpoint);
			console.log(response.data);
		
		}
		return {data:response.data}
	},
};
