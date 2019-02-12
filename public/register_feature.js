import {
  FeatureCatalogueRegistryProvider,
  FeatureCatalogueCategory,
} from 'ui/registry/feature_catalogue';

FeatureCatalogueRegistryProvider.register(i18n => {
  return {
    id: 'logtrail',
    title: 'Logtrail',
    description: i18n('logtrail.registerFeatureDescription', {
      defaultMessage:
        'Plugin to view, search & tail logs in Kibana',
    }),
    icon: 'logtrailApp',
    path: '/app/logtrail',
    showOnHomePage: false,
    category: FeatureCatalogueCategory.DATA,
  };
});
