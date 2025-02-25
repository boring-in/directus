export default {
	id: 'api_caller_2.0',
	name: 'API caller operation 2.0',
	icon: 'box',
	description: 'Operation that is able to call internal api now with body and endpoint',
	overview: ({endpoint, body, response, token, is_local_endpoint}) => [
		{
			label: 'endpoint',
			endpoint: endpoint,
		},
		{	label: 'body',
			body: body,},

		{	label: 'response',
			response: response,
		},
		{
			label:'token',
			token:token,
		},
		{
			label: 'Is local endpoint',
			text: is_local_endpoint ? 'Yes' : 'No',
		}
	],
	options: [
		{
			field: 'endpoint',
			name: 'Endpoint string',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'input',
			},
		},
		{
			field: 'token',
			name: 'Access token',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'input',
			},
		},
		{
			field: 'is_local_endpoint',
			name: 'Is local endpoint',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'boolean',
			},
		},
		{
			field:'body',
			name: 'Body',
			type: 'object',
			meta: {
				width: 'full',
				interface: 'json',
			},
		}
	],
};
