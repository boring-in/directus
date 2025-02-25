import InterfaceCascadingDropdown from './interface.vue';

export default {
    id: 'cascading-dropdown-m2o',
    name: 'Cascading M2O Dropdown',
    icon: 'api',
    description: 'Two-level hierarchical selection from API endpoints',
    component: InterfaceCascadingDropdown,
    types: ['uuid', 'string', 'text', 'integer', 'bigInteger','alias'],
    localTypes: ['m2o','m2m'],
    group: 'relational',
    relational: true,
    options: ({ relations }) => {
        const collection = relations.m2o?.related_collection;

        return [
            {
                field: 'template',
                name: 'HTML Display Template',
                type: 'text',
                meta: {
                    interface: 'code',
                    options: {
                        language: 'html',
                        template: '<div class="custom-display">\n  <strong>{{name}}</strong>\n  <span class="related">{{related.field}}</span>\n</div>',
                    },
                    width: 'full',
                    note: 'Use {{field}} for direct fields and {{related.field}} for related fields',
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
                    note: 'Full URL for parent items endpoint. Use {{$CURRENT_ID}} to reference current form ID',
                },
            },
            {
                field: 'headers',
                name: 'API Headers',
                type: 'json',
                meta: {
                    interface: 'code',
                    options: {
                        language: 'json',
                        template: '{\n  "Authorization": "Bearer token",\n  "Custom-Header": "value"\n}',
                    },
                    width: 'full',
                    note: 'HTTP headers for API endpoints (JSON format)',
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
                    note: 'Full URL for child items endpoint. Use {id} placeholder for parent ID. Use {{$CURRENT_ID}} to reference current form ID',
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
            {
                field: 'enablePagination',
                name: 'Enable Pagination',
                type: 'boolean',
                meta: {
                    interface: 'boolean',
                    width: 'half',
                    note: 'Enable pagination for large datasets',
                },
                schema: {
                    default_value: false,
                },
            },
            {
                field: 'pageSize',
                name: 'Items Per Page',
                type: 'integer',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: '50',
                        min: 1,
                    },
                    note: 'Number of items to load per page when pagination is enabled',
                    conditions: [
                        {
                            rule: {
                                enablePagination: {
                                    _eq: true
                                }
                            },
                            hidden: false,
                            options: {
                                font: "monospace"
                            }
                        }
                    ]
                },
                schema: {
                    default_value: 50,
                },
            },
            {
                field: 'enableServerSearch',
                name: 'Enable Server-side Search',
                type: 'boolean',
                meta: {
                    interface: 'boolean',
                    width: 'half',
                    note: 'Enable server-side search for better performance with large datasets',
                },
                schema: {
                    default_value: false,
                },
            },
            {
                field: 'parentSearchEndpoint',
                name: 'Parent Search Endpoint',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'full',
                    options: {
                        placeholder: 'https://api.example.com/parents/search',
                    },
                    note: 'Endpoint for parent search (leave empty to use main endpoint). Use {{$CURRENT_ID}} to reference current form ID',
                    conditions: [
                        {
                            rule: {
                                enableServerSearch: {
                                    _eq: true
                                }
                            },
                            hidden: false
                        }
                    ]
                },
            },
            {
                field: 'childSearchEndpoint',
                name: 'Child Search Endpoint',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'full',
                    options: {
                        placeholder: 'https://api.example.com/children/search?parent_id={id}',
                    },
                    note: 'Endpoint for child search (leave empty to use main endpoint). Use {id} for parent ID. Use {{$CURRENT_ID}} to reference current form ID',
                    conditions: [
                        {
                            rule: {
                                enableServerSearch: {
                                    _eq: true
                                }
                            },
                            hidden: false
                        }
                    ]
                },
            },
            {
                field: 'searchParamName',
                name: 'Search Parameter Name',
                type: 'string',
                meta: {
                    interface: 'input',
                    width: 'half',
                    options: {
                        placeholder: 'search',
                    },
                    note: 'Name of the search query parameter',
                    conditions: [
                        {
                            rule: {
                                enableServerSearch: {
                                    _eq: true
                                }
                            },
                            hidden: false
                        }
                    ]
                },
                schema: {
                    default_value: 'search',
                },
            },
        ];
    },
};
