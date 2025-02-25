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
      name: 'Selector and Class Pairs',
      meta: {
        interface: 'list',
        options: {
          template: '{{selector}} -> {{classToAdd}}',
          fields: [
            {
              field: 'selector',
              type: 'string',
              name: 'Selector',
              meta: {
                interface: 'input',
                options: {
                  placeholder: 'Enter CSS selector (e.g., #id or .class)'
                }
              }
            },
            {
              field: 'classToAdd',
              type: 'string',
              name: 'Class to Add',
              meta: {
                interface: 'input',
                options: {
                  placeholder: 'Enter class name to add'
                }
              }
            }
          ]
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
  ],
  types: ['string'],
};