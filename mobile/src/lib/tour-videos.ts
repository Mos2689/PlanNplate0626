// The app-tour videos, in play order.
// `source` is either a bundled file
//   require('../../assets/videos/tour-plan-your-week.mp4')
// or a remote URL  { uri: 'https://…/tour-plan-your-week.mp4' }  (e.g. Supabase
// Storage). A null source shows a "coming soon" state in the player.

export type TourVideoSource = number | { uri: string } | null;

export interface TourVideo {
  id: string;
  title: string;
  blurb: string;
  durationLabel: string;
  source: TourVideoSource;
  tint: string;
  tryItLabel: string;
  tryItRoute: string;
  // Query param that receives a fresh timestamp on each tap, so a screen that
  // is already mounted still reacts to the deep link.
  tryItFreshParam?: string;
}

export const TOUR_VIDEOS: TourVideo[] = [
  {
    id: 'save-from-social',
    title: 'Save recipes from social',
    blurb: 'Turn any Instagram reel into a recipe in seconds.',
    durationLabel: '0:20',
    source: require('../../assets/videos/tour-save-from-social.mp4'),
    tint: '#3F4D33',
    tryItLabel: 'Open my recipes',
    tryItRoute: '/(tabs)/recipes',
  },
  {
    id: 'recipe-library',
    title: 'Build your recipe library',
    blurb: 'Import, organise and make it your own.',
    durationLabel: '0:34',
    source: require('../../assets/videos/tour-recipe-library.mp4'),
    tint: '#B8A27A',
    tryItLabel: 'Add a recipe',
    tryItRoute: '/(tabs)/recipes',
    tryItFreshParam: 'openAddSheet',
  },
  {
    id: 'plan-your-week',
    title: 'Plan your week',
    blurb: 'Set up your plan, batch cook, swap meals, and get your groceries.',
    durationLabel: '0:30',
    source: require('../../assets/videos/tour-plan-your-week.mp4'),
    tint: '#546445',
    tryItLabel: 'Plan my meals',
    tryItRoute: '/plan-meals',
  },
  {
    id: 'shop-smarter',
    title: 'Build your grocery list',
    blurb: 'Turn your meal plan into a smart shopping list.',
    durationLabel: '0:39',
    source: require('../../assets/videos/tour-grocery.mp4'),
    tint: '#E46D46',
    tryItLabel: 'Open grocery list',
    tryItRoute: '/(tabs)/grocery',
  },
  {
    id: 'explore',
    title: 'Discover & personalise',
    blurb: 'Find meal ideas based on your preferences and ingredients.',
    durationLabel: '0:18',
    source: require('../../assets/videos/tour-explore.mp4'),
    tint: '#7C8F68',
    tryItLabel: 'Explore recipes',
    tryItRoute: '/(tabs)/inspired',
  },
];
