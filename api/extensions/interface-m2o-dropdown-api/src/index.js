import InterfaceCascadingDropdown from './interface.vue';

export default {
    id: 'cascading-dropdown-m2o-api',
    name: 'Cascading M2O Dropdown 2 ',
    icon: 'api',
    description: 'Two-level hierarchical selection from API endpoints',
    component: InterfaceCascadingDropdown,
    types: ['uuid', 'string', 'text', 'integer', 'bigInteger'],
    localTypes: ['m2o'],
    group: 'relational',
    relational: true,
    options: ({ relations }) => {
        const collection = relations.m2o?.related_collection;

        return [
            {
                field: 'template',
                name: 'Display Template',
                meta: {
                    interface: 'system-display-template',
                    options: {
                        collectionName: collection,
                    },
                    width: 'full',
                },
            },
            {
                field: 'width',
                name: '$t:interfaces.select-dropdown.width',
                type: 'string',
                meta: {
                    width: 'half',
                    interface: 'select-dropdown',
                    options: {
                        choices: [
                            { text: '$t:interfaces.select-dropdown.width_small', value: 'small' },
                            { text: '$t:interfaces.select-dropdown.width_medium', value: 'medium' },
                            { text: '$t:interfaces.select-dropdown.width_large', value: 'large' },
                        ],
                    },
                },
                schema: {
                    default_value: 'medium',
                },
            },
            {
                field: 'parentEndpoint',
                name: 'Parent API Endpoint',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'full',
                    options: {
                        placeholder: 'https://api.example.com/parents',
                    },
                    note: 'Full URL for parent items endpoint',
                },
            },
            {
                field: 'parentHeaders',
                name: 'Parent Headers',
                type: 'json',
                meta: {
                    interface: 'code',
                    options: {
                        language: 'json',
                        template: '{\n  "Authorization": "Bearer token",\n  "Custom-Header": "value"\n}',
                    },
                    width: 'full',
                    note: 'HTTP headers for parent endpoint (JSON format)',
                },
            },
            {
                field: 'childEndpoint',
                name: 'Child API Endpoint',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'full',
                    options: {
                        placeholder: 'https://api.example.com/children?parent_id={id}',
                    },
                    note: 'Full URL for child items endpoint. Use {id} placeholder for parent ID',
                },
            },
            {
                field: 'childHeaders',
                name: 'Child Headers',
                type: 'json',
                meta: {
                    interface: 'code',
                    options: {
                        language: 'json',
                        template: '{\n  "Authorization": "Bearer token",\n  "Custom-Header": "value"\n}',
                    },
                    width: 'full',
                    note: 'HTTP headers for child endpoint (JSON format)',
                },
            },
            {
                field: 'parentIdPath',
                name: 'Parent ID Path',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'id',
                    },
                    note: 'JSON path to ID field in parent response',
                },
                schema: {
                    default_value: 'id',
                },
            },
            {
                field: 'parentLabelPath',
                name: 'Parent Label Path',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'name',
                    },
                    note: 'JSON path to display field in parent response',
                },
                schema: {
                    default_value: 'name',
                },
            },
            {
                field: 'childIdPath',
                name: 'Child ID Path',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'id',
                    },
                    note: 'JSON path to ID field in child response',
                },
                schema: {
                    default_value: 'id',
                },
            },
            {
                field: 'childLabelPath',
                name: 'Child Label Path',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'name',
                    },
                    note: 'JSON path to display field in child response',
                },
                schema: {
                    default_value: 'name',
                },
            },
            {
                field: 'parentPlaceholder',
                name: 'Parent Placeholder',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'Enter parent placeholder text',
                    },
                },
                schema: {
                    default_value: 'Select parent item',
                },
            },
            {
                field: 'childPlaceholder',
                name: 'Child Placeholder',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'Enter child placeholder text',
                    },
                },
                schema: {
                    default_value: 'Select child item',
                },
            },
        ];
    },
};
