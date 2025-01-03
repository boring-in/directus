import InterfaceComponent from './interface.vue';

export default {
  id: 'class-adder',
  name: 'Class Adder',
  icon: 'box',
  description: 'Adds and removes custom classes from selected DOM elements',
  component: InterfaceComponent,
  options: [
    {
      field: 'selectorClassPairs',
      type: 'json',
      name: 'Element Class Management',
      meta: {
        interface: 'list',
        options: {
          template: '{{selector}} -> Add: {{classesToAdd}}, Remove: {{classesToRemove}}',
          fields: [
            {
              field: 'selector',
              type: 'string',
              name: 'Element Selector',
              meta: {
                interface: 'input',
                options: {
                  placeholder: 'Enter CSS selector (e.g., #id or .class)'
                }
              }
            },
            {
              field: 'classesToAdd',
              type: 'string',
              name: 'Classes to Add',
              meta: {
                interface: 'input',
                options: {
                  placeholder: 'Enter class names to add (space-separated)'
                }
              }
            },
            {
              field: 'classesToRemove',
              type: 'string',
              name: 'Classes to Remove',
              meta: {
                interface: 'input',
                options: {
                  placeholder: 'Enter class names to remove (space-separated)'
                }
              }
            }
          ]
        }
      }
    }
  ],
  types: ['string'],
};
