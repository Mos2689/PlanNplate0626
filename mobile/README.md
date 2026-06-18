# Meal Planning App

A beautiful meal planning application built with React Native and Expo that helps you plan your weekly meals, manage recipes, and create grocery lists automatically.

## Features

### 1. User Authentication (Supabase)
- **Sign Up**: Create a new account with email, password, and full name
  - **Full Name Validation**: Names are validated in real-time with the following rules:
    - Maximum 50 characters
    - Minimum 2 characters
    - Supports international/Unicode characters (accented letters, Chinese, Arabic, etc.)
    - Allows letters, spaces, hyphens, and apostrophes
    - Numbers, special characters, and emojis are automatically filtered out
    - Multiple spaces collapsed to single space
    - Leading/trailing spaces trimmed
    - Character counter shows remaining characters
  - **Password Validation**: Strong passwords required with real-time feedback:
    - Minimum 12 characters (maximum 64 characters)
    - Must include: uppercase letter, lowercase letter, and number
    - Special characters optional but recommended
    - Cannot contain leading/trailing spaces
    - Cannot contain your full name
    - Rejects common passwords (e.g., "123456", "password")
    - Real-time strength indicator (Weak → Fair → Good → Strong)
    - Interactive checklist showing which requirements are met
    - Clear error messages guide users to create secure passwords
- **Login**: Secure login with email and password for existing accounts
  - **Field-Specific Error Messages**: When fields are missing, users see exactly which field is required:
    - "Email is required" (when only email is missing)
    - "Password is required" (when only password is missing)
    - "Email and password are required" (when both are missing)
- **Early Email Validation**: When signing up, the app checks if an email is already registered as soon as you leave the email field. If an account exists, you'll see options to Sign In or reset your password - no need to fill out the entire form first
- **Duplicate Email Prevention**: Attempting to sign up with an existing email shows clear error and redirects to login
- **Protected Routes**: App content only accessible after authentication
- **Session Persistence**: Users stay logged in across app restarts
- **Real-time Auth Sync**: App responds instantly to auth state changes
- **User Profile**: View your account details in Settings
- **Sign Out**: Easily log out from the Settings tab
- **Password Reset**: Secure OTP-based password reset within the app
- **Pause Account**: Temporarily disable access while keeping your data safe
- **Delete Account**: Permanently remove your account and all data

### First-Time User Onboarding Flow
When a user logs in for the first time, they are guided through a comprehensive 5-step onboarding experience:

1. **Welcome & Profile Setup** (Step 1)
   - Add your name
   - Choose an avatar (upload a photo or select from 6 default colored avatars)
   - Camera and gallery access for custom photos

2. **Dietary Preferences** (Step 2)
   - Select applicable dietary restrictions: Vegetarian, Vegan, Pescatarian, Gluten-Free, Dairy-Free, Keto, Paleo, Low-Carb, Halal, Kosher
   - Optional step - users can skip if no restrictions apply

3. **Food Allergies** (Step 3)
   - Mark food allergies: Peanuts, Tree Nuts, Dairy/Milk, Eggs, Fish, Shellfish, Soy, Wheat/Gluten, Sesame
   - Recipes will automatically avoid these ingredients
   - Optional step for users without allergies

4. **Cuisine Preferences** (Step 4)
   - Select favorite cuisines: Italian, Mexican, Japanese, Chinese, Indian, Thai, Mediterranean, American, Korean, French
   - Helps personalize recipe recommendations
   - Optional step

5. **Cooking Style** (Step 5)
   - **Skill Level**: Beginner (simple recipes), Intermediate (moderate complexity), Advanced (complex techniques)
   - **Prep Time Preference**: Quick (<30 min), Moderate (30-60 min), Elaborate (no limit)
   - **Default Serving Size**: Adjustable from 1-12 servings

The onboarding flow features:
- Visual progress indicator showing current step
- Back navigation to edit previous choices
- Beautiful animations and haptic feedback
- Dark mode support
- All preferences are saved and used for personalized recipe generation

#### Password Reset Flow
The app uses a secure OTP (One-Time Password) based password reset instead of browser-based links:
1. User taps "Forgot Password?" on login screen
2. Enters their email address
3. Receives a 6-digit OTP via email (valid for 30 minutes)
4. Enters the OTP in the app verification screen
5. Once verified, password reset screen opens within the app
6. User sets a new password and confirms it
7. Password is immediately updated and user can log in with new password

#### Authentication Architecture
- **Separate Flows**: Sign Up uses `auth.signUp()`, Login uses `signInWithPassword()` - never mixed
- **Session Detection**: On app startup, checks for valid session and routes accordingly
- **Error Handling**: Clear, user-friendly error messages for all auth scenarios
- **Session Storage**: Secure AsyncStorage on mobile, auto-refresh tokens enabled
- **OTP Verification**: Uses Supabase's OTP verification system with 30-minute expiry

### 2. Meal Planning
- **Month/Year Selector**: Tap the month and year header (e.g., "February 2025") to open a dropdown where you can directly select any month and year within your allowed date range
  - **Easy Navigation**: Select both month and year from scrollable pickers in a single modal
  - **Date Range Restriction**: Only months within one year from your account creation date can be selected
  - **Visual Feedback**: Unavailable months/years appear disabled (grayed out)
- **Date Range Restriction**: You can only navigate past dates within one year from your account creation date. Attempting to navigate earlier will show a warning haptic and disable the navigation button for visual feedback
- **Daily Navigation**: Use the left/right chevron buttons to move across dates day-by-day, or tap on any day in the horizontal calendar
  - **Past Date Limitation**: Days older than one year from account creation are disabled and cannot be selected
  - **Visual Indicators**: Disabled dates appear faded (reduced opacity)
  - **Navigation Limits**: The week navigation (prev/next buttons) prevents scrolling beyond one year from account creation
- **Dynamic Week Display**: The week number automatically updates as you navigate to different dates
- **Meal Slots**: Plan breakfast, lunch, dinner, and snacks for each day
- **Multiple Recipes Per Meal**: Add multiple recipes to each meal type (e.g., multiple dishes for dinner) with a count badge showing how many recipes are planned
- **Clean Meal Card Display**: Meal cards show only the recipe image, name, time, and calories. A count badge appears when multiple recipes are assigned
- **Single Recipe Selection**: When you select and add a single recipe to your meal plan, it's immediately applied and persists even after logging out and back in
- **Recipes Management Modal**: Tap on any meal card with recipes to open a modal where you can:
  - **Edit Serving Sizes**: Adjust portions by tapping the Settings button. Increase or decrease servings with +/- buttons or preset shortcuts (1, 2, 4, 6 servings). View all ingredients with automatically calculated quantities based on the new serving size. **When you save changes, all ingredients and grocery list quantities are automatically updated**
  - **Swap Recipes**: Replace any recipe with a different one using the refresh button
  - **Delete Recipes**: Remove recipes from your meal using the trash button
  - **Add More**: Add additional recipes to the same meal type using the plus button in the modal header
  - **Close Modal**: Tap outside the modal area to close it
- **Visual Progress**: Track how many meals you've planned for the week
- **Quick Add**: Tap the "Add meal-type" button on empty meal slots to quickly add recipes
- **Long Press to Delete**: Long press (hold for 0.5 seconds) on any meal card (breakfast, lunch, dinner, snack) to trigger a delete confirmation popup. Tap "Yes" to delete all recipes for that meal type, or "No" to cancel
- **Curated Meal Plans**: Choose from predefined meal plans to automatically fill your calendar:
  - **Balanced Everyday Plan** (Default): 7-day moderate portions with familiar Australian foods, perfect for families
  - **High-Protein Simple Plan**: 7-day muscle-supporting meals with protein in every meal, ideal for fitness and everyday energy
  - **Family-Friendly Plan**: 7-day plan with one base meal and easy swaps for mixed ages. Kid-friendly textures with optional spice/sauce add-ons for adults
  - **Budget-Smart Plan**: 7-day low-cost meal plan using pantry staples and repeated ingredients. Perfect for students and budget-conscious households
  - **Light & Digestive Easy Plan**: 7-day gentle, low-spice meals for seniors and people with sensitive digestion. Features porridge, soups, steamed vegetables with protein, and yogurt-based meals
  - **Just for One**: 7-day budget-friendly single-serving meals designed for solo dining. Features one-pot recipes, leftover-friendly dishes, and cross-recipe ingredient planning to minimize waste. Quick 10-30 minute meals with balanced macros
  - **Healthy Week**: 7-day balanced meal plan focused on whole foods, lean proteins, and vegetables
  - **Quick & Easy**: 5-day plan with recipes that take 30 minutes or less
  - **Vegetarian Delight**: 7-day plant-based meal plan packed with protein and nutrients
  - Each plan includes breakfast, lunch, and dinner with detailed recipes tailored to Australian eating preferences
  - **Comprehensive Recipe Instructions**: All recipes include elaborate step-by-step instructions with precise temperatures, timing, and technique details. No vague steps like "add sauce" - every recipe provides complete guidance from ingredients to plating
  - **Flexible Start Date**: When applying a plan, choose which date to start the meal plan. Use the chevron buttons to navigate to your preferred start date
  - **Conflict Handling**: If you select a meal plan for a period that already has recipes planned, a dialog appears asking whether to:
    - **Keep Both**: Add the meal plan recipes alongside existing meals
    - **Replace**: Remove existing meals and apply the new plan
  - **Daily Meal View**: Click "View All Recipes" to open an interactive slider where you can browse through each day of the meal plan. Each day's view shows:
    - All meals for that day (breakfast, lunch, dinner, snacks) with recipe images
    - Total calories and prep time for the day
    - Number of meals planned
    - Individual meal details including calories and cooking time
    - **Swap Recipes Note**: Reminder that you can swap any recipe in your meal plan using the refresh button in the meal plan section
  - Plans automatically add recipes to your collection and assign them to your meal calendar starting from your selected date

### 3. Recipe Management
- **Recipe Collection**: Browse and manage your recipes
- **Save Favorites**: Mark recipes as favorites with the heart icon for quick access
- **Search & Filter**: Search recipes by name or filter by category (Breakfast, Quick, Healthy, etc.)
- **Saved Tab**: View only your favorited recipes by toggling the "Saved" filter button
- **Quick Add from Select Recipes**: When selecting recipes to add to your meal plan, you can quickly create new recipes without leaving the screen:
  - **Add Button** (Blue): Navigate directly to manual recipe creation
  - **Import Button** (Amber): Import recipes from URLs, text, or web content
  - **AI Button** (Purple): Generate recipes using AI-powered recipe generation
  - **Recipe Ordering**: Newly added recipes (via Add, Import, or AI generation) appear at the **top of the selection list** in their respective meal type sections (Breakfast, Lunch, Dinner, Snack), making recently created recipes easy to find and reuse
- **Recipe Details**: View full ingredients list, instructions, cook time, and calories
- **Edit Recipes**: Edit ingredients and instructions for any recipe:
  - Tap the edit button (pencil icon) on any recipe detail screen
  - Modify ingredient quantities and units
  - Edit or remove instructions
  - Works for all recipe types: AI-generated, curated meal plans, imported, and manually added recipes
  - Changes are automatically saved to your recipe collection
- **Auto Meal Type Classification**: Every recipe is automatically classified into one of 4 meal types (Breakfast, Lunch, Dinner, Snack):
  - **Automatic Classification**: When you add, import, or manually create a recipe, the app analyzes its content (ingredients, calories, prep time, servings) to classify it
  - **Displayed in Tags**: The classified meal type appears as a green auto-generated tag in the Tags section during recipe creation/editing
  - **Non-removable**: The meal type tag is marked with a ✓ checkmark and cannot be deleted (it's auto-assigned based on content analysis)
  - **Works for All Recipes**: Imported recipes from URLs/text, manually added recipes, and AI-generated recipes all get classified using the same rules
  - **Consistent Ordering**: All recipes automatically appear in the meal plan under the correct meal type category (breakfast, lunch, dinner, snack)
- **AI Recipe Generation**: Generate new recipes based on your preferences (uses OpenAI API directly)
  - **Single Recipe Generation**: Generate a single recipe for any meal type. When you save a single recipe, it's automatically added to your meal plan for the selected date and meal type
- **Meal Plan Generation**: Generate multiple recipes at once for 1-4 weeks or a full month
- **Calendar Integration**: Select a start date and recipes are automatically assigned to your meal plan
  - **Date Range Restriction**: You can only select dates within one year from your account creation date
  - **Calendar Navigation Limits**: The calendar prev/next buttons prevent navigation beyond the one-year window
  - **Visual Feedback**: Past dates outside the allowed range appear disabled and cannot be selected
- **Add from Existing Recipes**: Include recipes from your collection in your AI-generated meal plan
- **Import Recipes**: Import recipes from URLs (Instagram, TikTok, Pinterest, YouTube, recipe websites) or pasted text
- **Voice Input**: Speak your recipe and it automatically fills in all recipe details (uses OpenAI Whisper)
- **Upload Recipes**: Upload recipe images or paste recipe text, and AI automatically extracts and fills in the recipe fields (uses GPT-4o vision)
- **Recipe Source Badges**: Each recipe shows its source with a color-coded badge:
  - **AI** (orange): AI-generated recipes
  - **Imported** (blue): Imported from URL, text, image, or voice
  - **Custom** (green): Manually added recipes
- **Source URL Links**: Imported recipes from web URLs display a link icon - tap to open the original recipe source in your browser
- **Default Unsaved**: All new recipes (AI-generated, imported, or manually added) start as unsaved. Tap the heart icon to mark as favorite and add to your "Saved" collection.
- **Duplicate Import Prevention**: When importing a recipe from a URL, if that recipe has already been imported, the app prevents duplicate saves and shows a clear message: "Recipe Already Imported - This recipe has already been imported from this URL."

### 4. Grocery List
- **Auto-Generate**: Create grocery lists automatically from your meal plan by selecting a date range from the calendar
- **Quick Refresh**: Tap the refresh button (↻) in the top right to quickly regenerate the grocery list for the **previously selected date range** without re-selecting dates
- **Persistent Custom Items**: Add manual grocery items that stay on your list regardless of which meal dates you select
  - **Two Sections**: "From Meals" (auto-generated) and "Custom Items" (manually added) with clear visual distinction
  - **Always Available**: Custom items are always visible and persist across date range changes
  - **Smart Combining**: Manually added items automatically combine with each other if they match by name and category
  - **Independent Management**: Custom items can be deleted, checked off, or added anytime without affecting your meal plan
  - **Perfect for**: Mid-week reminders (e.g., "I need olive oil for next week's shopping trip")
  - **Item Name Validation**: When adding items manually, names are validated in real-time:
    - Minimum 2 characters, supports international characters
    - Must contain at least one letter
    - Allows: letters, numbers, spaces, hyphens, apostrophes, ampersands, commas, periods
    - Prevents: pure numeric values (e.g., "2222"), emojis, special characters
    - Real-time error messages guide users to enter valid item names
- **Save Grocery Lists**: Save up to 4 grocery lists for future shopping trips
  - **Save Button** (💾): Tap to save current grocery list with a custom name
  - **Smart Saving**: Automatically removes checked items and combines meal + custom items into a single unified list
  - **Saved Lists Menu** (🔖): View all saved lists (max 4) with item counts and creation dates
  - **Load Saved Lists**: Tap "Load" to switch to viewing/editing a saved list
  - **Delete Lists**: Remove saved lists you no longer need
  - **Maximum Capacity**: App prevents saving more than 4 lists - delete old ones to make room
  - **Separate Data Management**: Grocery list and saved lists are completely separate:
    - Loading a saved list doesn't affect your original grocery list data
    - Editing items in a saved list only modifies that list, not your grocery list
    - Switching between grocery list and saved list modes preserves all data in both
  - **Checked Items Display**: In saved list mode, checked items are kept and displayed at the bottom of each category section with a "Completed" divider, allowing you to see what's been purchased while keeping the list intact. When you save and revisit a list, all checked items are preserved exactly as they were.
- **Smart Aggregation**: Same ingredients are automatically combined into a single line, even when added with different units
  - Example: "2 cups rice" + "1 cup rice" → Shows as "3 cups" (NOT mL)
  - Example: "2 tbsp olive oil" + "1/4 cup olive oil" → Shows as "90 mL"
  - Unit Normalization: All unit variations normalize to canonical forms (e.g., "tablespoons" + "tbsp" combine as "tbsp")
  - Supports all variations: teaspoon/tsp/t, tablespoon/tbsp, cup/cups, gram/g, kilogram/kg, etc.
- **Smart Volume Unit Classification**: Correctly handles solid vs liquid ingredients based on physical state
  - **Solids measured by volume** (olives, cheese, nuts, vegetables, grains, berries, capers): ALWAYS stay in **cups** - never converted to mL
  - **Liquids** (milk, oil, water, broth, juice, vinegar, wine): ALWAYS convert to **mL/L**
  - **Unknown ingredients**: Default to **cups** (solid) - only explicitly known liquids convert to mL
  - Single Line Per Ingredient: Never shows duplicate ingredient rows regardless of which recipes they come from
- **Strict Unit Type Rules**: Intelligent unit validation ensures ingredients display in appropriate units
  - Proteins (chicken, beef, pork, fish, eggs, **protein bars**): Always displayed in grams or count, NEVER mL
  - Vegetables (lettuce, carrot, tomato): Always in grams or count, NEVER volume
  - Liquids (milk, oil, broth): Always in mL/L, NEVER weight
  - Grains/Solids (rice, pasta, flour, oats): Always in **cups**, NEVER mL
  - Solid foods in cups (olives, cheese, berries): Always in **cups**, NEVER mL
  - Smart conversion: "1 cup chicken" automatically converts to "240 g" at ingestion time
  - **Countable Items**: Protein bars and similar countable items are validated to use count units (pieces, bars, whole) instead of weight
  - **Example Fix**: "Protein bar: 1g" is corrected to "Protein bar: 1 piece" to display correctly in grocery lists
- **User-Friendly Cup Fractions**: Displays cups as common fractions (1/4, 1/2, 3/4, 1 1/2 cups) for intuitive cooking measurements
- **Organized by Category**: Items grouped by produce, dairy, meat, pantry, etc.
  - **Smart Categorization**: Ingredients are automatically categorized correctly regardless of AI assignment
    - Plant-based proteins (tofu, tempeh, lentils, beans) → **Pantry**
    - Actual meat & seafood (chicken, beef, fish, shrimp) → **Meat & Seafood**
    - Fresh vegetables & fruits (carrots, spinach, apples, etc.) → **Produce**
    - Dairy products (milk, cheese, yogurt, eggs) → **Dairy**
    - Dry goods & oils (rice, pasta, olive oil) → **Pantry**
  - **Collapse/Expand Categories**: Tap on any category header to collapse or expand that section
  - **Smart Defaults**: All categories default to expanded view
  - **Independent Controls**: Each category can be collapsed/expanded independently
  - **Visual Indicator**: Chevron icon rotates to show collapse state (▼ expanded, ▶ collapsed)
  - **Alphabetical Sorting**: Items within each category sorted alphabetically, with unchecked items first, then checked items
- **Check Off Items**: Mark items as purchased while shopping
- **Clear Completed**: Remove checked items with one tap

### 5. User Profile
- **Profile Page**: Beautiful profile page with user avatar, premium badge, and activity statistics
  - **Profile Header**: Shows user avatar, name, and customizable title/subtitle
  - **Premium Badge**: Displays a premium badge for subscribed users
  - **Edit Profile Button**: Opens modal to edit profile and preferences
  - **Share Button**: Share your profile (coming soon)
- **Activity Overview**: Visual statistics cards showing:
  - **Weekly Streak**: Number of consecutive weeks with meal plans
  - **Meals This Week**: Total meals planned in the current week
  - **Calories This Week**: Total calories from meals planned this week
  - **Shopping Lists**: Quick access button that navigates to the Shopping Lists tab
- **Cooking DNA**: Auto-generated tags based on your preferences
  - Plant-Based (for vegetarian/vegan users)
  - Quick (for users who prefer quick prep times)
  - Pesca (for users with fish/seafood cuisine preferences)
  - Chef's Mode (for advanced skill level users)
  - Home Cook (default for all users)
- **Edit Profile Modal**: Full-screen modal for editing profile and preferences
  - **Profile Photo**: Change your avatar photo (take photo or choose from library)
  - **Display Name**: Edit your display name
  - **Title/Subtitle**: Customize your profile title (e.g., "Aspiring Chef", "Home Cook", "Meal Prep Pro")
    - Quick suggestions: Home Cook, Aspiring Chef, Professional Chef, Food Enthusiast, Health Conscious, Busy Parent, Meal Prep Pro
  - **Default Servings**: Set how many people you usually cook for (1-12)
  - **Cooking Skill Level**: Beginner, Intermediate, or Advanced
  - **Prep Time Preference**: Quick, Moderate, or Elaborate
  - **Dietary Restrictions**: Vegetarian, Vegan, Gluten-Free, Dairy-Free, Keto, Paleo, Low-Carb, Low-Sodium, Halal, Kosher
  - **Cuisine Preferences**: Italian, Mexican, Asian, Mediterranean, Indian, American, French, Japanese, Thai, Greek
  - **Allergies**: Peanuts, Tree Nuts, Milk, Eggs, Wheat, Soy, Fish, Shellfish, Sesame

## Project Structure

```
src/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab navigation layout
│   │   ├── index.tsx        # Meal Plan tab (home)
│   │   ├── recipes.tsx      # Recipes tab
│   │   ├── grocery.tsx      # Grocery List tab
│   │   └── preferences.tsx  # Settings tab
│   ├── _layout.tsx          # Root navigation layout with auth protection
│   ├── login.tsx            # Login screen
│   ├── signup.tsx           # Sign up screen
│   ├── verify-otp.tsx       # OTP verification screen for password reset
│   ├── reset-password.tsx   # Password reset screen (OTP-based)
│   ├── select-recipe.tsx    # Recipe selection modal
│   ├── generate-recipe.tsx  # AI recipe generation screen
│   ├── import-recipe.tsx    # Recipe import screen (URL/text)
│   ├── import-review.tsx    # Review imported recipe before saving
│   └── curated-meal-plan.tsx # Curated meal plan selection screen
├── components/
│   ├── StoreHydration.tsx       # Store hydration wrapper
│   ├── EditProfileModal.tsx     # Edit profile modal with preferences
│   ├── ProfileSetupModal.tsx    # Profile avatar setup modal
│   ├── AccountManagementModal.tsx # Account management (pause/delete)
│   └── Themed.tsx               # Themed components
└── lib/
    ├── store.ts                  # Zustand store for app state
    ├── auth-store.ts             # Zustand store for authentication (Supabase)
    ├── supabase.ts               # Supabase client configuration
    ├── secure-api.ts             # Secure API client with auth & rate limiting
    ├── openai.ts                 # OpenAI API integration
    ├── recipeImport.ts           # Recipe import service with AI extraction
    ├── curated-meal-plans.ts     # Predefined meal plan data and helpers
    ├── unit-conversion.ts        # Unit conversion utilities (ml, g, pieces)
    ├── ingredient-aggregation.ts # Ingredient aggregation helpers
    ├── ingredient-aliases.ts     # Ingredient name and unit normalization
    ├── cn.ts                     # className utility
    └── useColorScheme.ts         # Color scheme hook
```

## Tech Stack

- **Framework**: Expo SDK 53, React Native 0.76.7
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand with AsyncStorage persistence
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Animations**: React Native Reanimated
- **Icons**: Lucide React Native
- **Server State**: TanStack React Query

## Supabase Setup

To enable user authentication and data persistence with Supabase:

### 1. Create Supabase Project
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to the ENV tab in the Vibecode app
3. Add your Supabase credentials:
   - `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key

You can find these values in your Supabase dashboard under **Settings > API**.

### 2. Set Up Database Tables
1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase-schema.sql` from this project
4. Paste and run the SQL to create all required tables

The schema creates the following tables:
- `user_preferences` - Dietary restrictions, cooking preferences
- `recipes` - User's recipe collection
- `meal_slots` - Meal plan assignments
- `grocery_items` - Shopping list items

All tables have Row Level Security (RLS) enabled so users can only access their own data.

### 3. Set Up Auto User Creation Trigger
**IMPORTANT**: Run the `supabase-auto-user-creation.sql` script to automatically create user entries when new users sign up.

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase-auto-user-creation.sql`
4. Paste and run the SQL

This creates:
- **Database Trigger**: Automatically creates a user entry in the `users` table when someone signs up via Supabase Auth
- **Logging Table**: `user_creation_logs` table for debugging user creation issues
- **Helper Functions**: `sync_auth_user_to_users_table()` for manual user sync if needed
- **Backfill Script**: Automatically creates entries for existing auth users who don't have `users` table entries

#### Debugging User Creation Issues
To view user creation logs:
```sql
SELECT * FROM user_creation_logs ORDER BY created_at DESC LIMIT 20;
```

To check for auth users without users table entries:
```sql
SELECT au.id, au.email, au.created_at
FROM auth.users au
LEFT JOIN users u ON au.id = u.id
WHERE u.id IS NULL;
```

To manually sync a specific user:
```sql
SELECT sync_auth_user_to_users_table('user-uuid-here');
```

### Authentication Features
- Email/password sign up and login
- Automatic session persistence
- Secure token refresh
- Protected routes (requires login to access app)

### Data Persistence Features
- All recipes sync to cloud automatically
- Meal plans persist across devices
- User preferences saved to database
- Grocery lists synced in real-time

## AI Recipe Generation

### Security & Authentication

All OpenAI API calls are secured through Supabase Edge Functions with user authentication and server-side rate limiting:

#### Architecture
1. **Server-Side API Key**: OpenAI API key is stored as a Supabase secret - never exposed to the client
2. **Supabase Edge Functions**: All OpenAI calls are proxied through secure Edge Functions
3. **JWT Authentication**: Every request is verified using Supabase JWT tokens
4. **Server-Side Rate Limiting**: Rate limits enforced in the database (not client-side)

#### Edge Functions
- `openai-chat`: Handles chat completions (recipe generation, text parsing, image parsing)
- `openai-transcribe`: Handles audio transcription (Whisper API for voice input)

#### Rate Limit Details
- **50 requests per hour** per authenticated user
- Rate limits stored in `api_rate_limits` table in PostgreSQL
- Atomic operations prevent race conditions
- Rate limit info returned with every response

#### Protected Endpoints
- Recipe generation (single and meal plans)
- Recipe import from URLs
- Recipe import from text
- Voice transcription (Whisper API)
- Image parsing (GPT-4o Vision)

#### Session Management
The secure API client automatically refreshes JWT tokens before each API call to prevent "Session expired" errors:
- Before every API call, `refreshSession()` is called to get fresh tokens
- This ensures tokens are always valid when sent to Edge Functions
- If refresh fails, the cached session is checked as a fallback
- Users only see "Session expired" if both fresh and cached tokens are invalid

#### Error Handling
When users hit rate limits or authentication issues:
- Clear error messages are shown
- Time until rate limit reset is displayed
- Users are prompted to log in if not authenticated

### Supabase Edge Functions Setup

To enable AI recipe generation, you must deploy the Supabase Edge Functions:

#### 1. Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# npm
npm install -g supabase

# or use npx
npx supabase
```

#### 2. Link Your Project
```bash
# Login to Supabase
supabase login

# Link to your project (get project ref from dashboard URL)
supabase link --project-ref your-project-ref
```

#### 3. Set Server Secrets
```bash
# CRITICAL: Set your Supabase Anon Key (required for JWT verification)
# Get this from Supabase Dashboard > Settings > API > Project API keys > anon public
# Note: Use PROJECT_ANON_KEY (not SUPABASE_ANON_KEY - that prefix is reserved)
supabase secrets set PROJECT_ANON_KEY=your-anon-key-here

# Set your OpenAI API key as a server secret
supabase secrets set OPENAI_API_KEY=sk-your-openai-api-key

# Verify secrets are set (should show both)
supabase secrets list
```

**IMPORTANT**: The `PROJECT_ANON_KEY` must match the `EXPO_PUBLIC_SUPABASE_ANON_KEY` in your app's environment variables. This is required for JWT token verification in Edge Functions.

#### 4. Run Database Migration
Create the rate limits table by running this SQL in your Supabase SQL Editor:

```sql
-- Create api_rate_limits table for server-side rate limiting
CREATE TABLE IF NOT EXISTS api_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Enable Row Level Security
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by Edge Functions)
CREATE POLICY "Service role can manage rate limits"
  ON api_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can only read their own rate limit
CREATE POLICY "Users can read own rate limit"
  ON api_rate_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

#### 5. Deploy Edge Functions
```bash
# Deploy all functions
supabase functions deploy openai-chat
supabase functions deploy openai-transcribe

# Or deploy all at once
supabase functions deploy
```

#### 6. Verify Deployment
After deployment, your Edge Functions will be available at:
- `https://your-project-ref.supabase.co/functions/v1/openai-chat`
- `https://your-project-ref.supabase.co/functions/v1/openai-transcribe

The app will automatically use these endpoints through `supabase.functions.invoke()`.

#### Local Development
For local testing with Edge Functions:
```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve --env-file .env.local
```

Create `.env.local` for local secrets:
```
OPENAI_API_KEY=sk-your-openai-api-key
```

### Duration Options
When generating recipes, you can choose from several duration options:
- **Single Recipe**: Generate one recipe at a time
- **3 Days**: Generate 3 days worth of meals
- **1 Week**: Generate 7 unique recipes for a week of meals
- **Custom**: Select a custom date range with the calendar picker

### Meal Type Display
When viewing generated recipes:
- Each recipe shows a **color-coded meal type badge** (Breakfast, Lunch, Dinner, or Snack)
- **Breakfast** recipes display an amber/yellow badge
- **Lunch** recipes display an orange badge
- **Dinner** recipes display an indigo/purple badge
- **Snack** recipes display an emerald/green badge
- Recipes are **automatically sorted by meal type order**: Breakfast → Lunch → Dinner → Snack

### Regenerate Individual Recipes
When generating a meal plan, each recipe in the preview has a regenerate button (circular refresh icon on the right). If you don't like a particular recipe:
1. Tap the regenerate button next to that recipe
2. A new recipe will be generated to replace it
3. All other recipes in your plan remain unchanged
4. The new recipe will be different from all existing recipes in your plan

### Grocery Optimization
When generating meal plans (3+ days), you can enable **Optimize Grocery Shopping** to intelligently balance ingredient efficiency with variety, nutrition, and taste.

**When Enabled:**
- **Minimizes total ingredient count** by prioritizing household staples
- **Favors ingredients commonly used together** and likely already in pantries
- **Reuses ingredients across multiple recipes** where possible (e.g., use same chicken, onion, garlic in multiple dishes)
- **Avoids niche or single-use ingredients** unless explicitly requested
- **Aims for 8-12 ingredients per recipe maximum**
- **IMPORTANT: Never repeats recipes** - always generates all unique recipes with shared ingredients
- Reduces food waste and shopping complexity

**Protein Diversity Requirements (when enabled):**
- **4 or fewer lunch/dinner meals**: At least 1 protein source
- **5-6 lunch/dinner meals**: At least 2 different protein sources (e.g., Chicken + Fish, Beef + Pork)
- **7+ lunch/dinner meals**: At least 3 different protein sources (e.g., Chicken + Fish + Pork)

**Pantry-Based Proteins for Diversity:**
When optimizing grocery shopping, pantry proteins like lentils, chickpeas, beans, tofu, or eggs may be used to meet protein diversity requirements while maintaining ingredient efficiency.

**Recipe Distinctness Requirements (Anti-Variation Rule):**
When generating with Optimize Grocery enabled and Allow Repeats disabled, each recipe must be **structurally and sensorially distinct** from others:
- **Format must differ**: If some recipes are stir-fries, others must be curries, roasts, soups, pasta, salads, bowls, or sandwiches (NOT all stir-fries)
- **Cooking technique must vary**: If some use pan-frying, others must use oven-roasting, simmering, grilling, boiling, or steaming
- **Flavor systems must contrast**: If some use Asian profiles, others must use Mediterranean, South Asian, Middle Eastern, Latin, or Western flavors
- **CRITICAL**: Minor ingredient swaps do NOT count as distinct. "Lemon Chicken Stir-Fry" + "Garlic Chicken Stir-Fry" are the same family and not allowed - both are stir-fries with similar cooking methods
- **Example of CORRECT distinctness**: Stir-Fry (pan-fry, east-asian) + Curry (simmer, south-asian) + Roast (oven, western) + Soup (boil, fresh-citrus)

**Taste & Variety Guarantee:**
Even with ingredient reuse:
- Each recipe has a **distinctly different taste profile** and cooking style
- Cuisines, cooking methods, and dish formats are genuinely varied
- Meals never feel interchangeable or monotonous
- All recipes remain balanced, appealing, and suitable for regular consumption
- Taste and satisfaction are **never compromised** for ingredient efficiency

### Ingredient Quantity Validation & Metric Units

The app includes intelligent ingredient validation to ensure all ingredients have correct quantities and units, with **metric units enforced throughout**:

**Issues Fixed:**
- **Zero or NaN quantities**: Automatically replaced with sensible defaults
- **Missing units**: Auto-assigned based on ingredient type
- **Invalid units**: Replaced with appropriate alternatives, or converted from imperial to metric
- **Imperial/US units**: Automatically converted to metric (oz→g, lb→g, cup→mL, tbsp→mL, tsp→mL)

**Metric Units Used:**
- **Volume**: mL (millilitres), L (litres) - NO cups, tablespoons, teaspoons
- **Weight**: g (grams), kg (kilograms) - NO ounces or pounds
- **Count**: pieces, cloves, heads, cans, jars, slices, stalks, bunches, etc.

**How It Works:**
1. **AI Generation**: OpenAI is prompted to use metric units only
2. **Validation Layer**: Each ingredient is validated and any imperial/US units are converted to metric
3. **Unit Conversion**:
   - Teaspoons (tsp) → 5 mL
   - Tablespoons (tbsp) → 15 mL
   - Cups → 240 mL
   - Ounces (oz) → 28.35 g
   - Pounds (lb) → 453.6 g
4. **Fallback Defaults**: Smart metric defaults for common ingredients
5. **Display**: All grocery list quantities shown in metric only

**Example Conversions:**
- "1 cup flour" → "240 g flour"
- "2 tbsp olive oil" → "30 mL olive oil"
- "8 oz chicken" → "227 g chicken"
- "1 tsp salt" → "5 mL salt"
- Salt with "0 undefined" → "5 mL salt"
- Garlic with "3 pieces" → "3 clove garlic"

This ensures your grocery list displays consistent, easy-to-use metric quantities that work globally.

### Intelligent Ingredient Normalization & Aggregation

The grocery list uses a sophisticated multi-stage normalization and aggregation pipeline to intelligently combine ingredients:

**Stage 1: Name Normalization**
- **Descriptor Stripping**: Removes cooking descriptors (raw, cooked, boneless, skinless, chopped, etc.)
  - "fresh boneless chicken breast" → canonical name: "chicken"
  - "diced tomato" → canonical name: "tomato"
- **Alias Resolution**: Handles common ingredient variations
  - "chicken breast" → "chicken"
  - "bell pepper" & "sweet pepper" → "pepper"
  - "cheddar cheese" & "mozzarella cheese" → "cheese"

**Stage 2: Unit Type Classification**
Every ingredient is classified into one of three types:
- **WEIGHT**: Measured in g or kg (chicken, flour, salt)
- **VOLUME**: Measured in mL or L (milk, oil, broth)
- **COUNT**: Measured in pieces/units (eggs, garlic cloves, cans)

**Stage 3: Intelligent Aggregation Rules**

**Rule 1: Same Unit Type → Direct Sum**
- If ingredients have same canonical name and same unit type, directly sum quantities
- Example: "Chicken 300 g" + "Chicken 500 g" → "Chicken 800 g"

**Rule 2: Count + Weight → Smart Conversion**
- If the same ingredient appears as BOTH COUNT and WEIGHT, convert count to weight using ingredient-specific averages
- Example average weights (per piece):
  - Chicken breast: 200 g
  - Garlic clove: 5 g
  - Onion (medium): 150 g
  - Tomato (medium): 150 g
  - Egg: 50 g
- Example: "Chicken 4 pieces" + "Chicken 500 g" → Convert 4 × 200g = 800g → Total "Chicken 1.3 kg"

**Rule 3: Mixed Types Without Conversion**
- If ingredients can't be converted (e.g., Volume + Count), keep as separate grocery list entries
- Example: "Milk 500 mL" stays separate from "Eggs 3"

**Stage 4: Display Rounding**
All displayed quantities are rounded for user-friendliness:
- Weights: Rounded to nearest 5 g (e.g., 127 g → 125 g)
- Volumes: Rounded to nearest 5 mL (e.g., 34 mL → 35 mL)
- Count: Displayed as-is (whole numbers)

**Grocery List Output Example**
```
Chicken 1.3 kg (from 4 recipes)
Onion 600 g (from 3 recipes)
Garlic 30 clove (from 5 recipes)
Olive oil 150 mL (from 2 recipes)
Milk 1 L (from 2 recipes)
Salt 15 mL (from 6 recipes, various amounts)
```

**When Disabled:**
- Optimizes for authentic flavour, culinary balance, and quality
- Uses specialty ingredients if they improve the dish
- Doesn't worry about minimizing ingredient count
- Focuses on taste and authenticity

**Base Household Staples Used (when enabled):**
Chicken breast, eggs, rice, pasta, onion, garlic, olive oil, salt, pepper, lemon, lime, bell pepper, tomato, carrots, celery, potatoes, milk, butter, canned tomatoes, vegetable broth, soy sauce, ginger, paprika, cumin, cinnamon, sugar, vinegar, honey, basil, oregano, thyme

This feature is enabled by default for meal plans and helps create shopping lists that are both economical and practical.

### Allow Repeats
When generating meal plans, you can toggle **Allow Repeats** to:
- **Enabled (default)**: Reuse lunch and dinner recipes across the meal plan period to reduce cooking. Saves time by allowing leftovers.
- **Disabled**: Generate all unique recipes with no repeats during the selected period. Great for variety and trying different dishes.

**Repeat Rules:**
- Each unique recipe can appear **maximum 2 times total** (original + 1 repeat)
- Number of recipes that can be repeated depends on meal count:
  - 3-4 lunch/dinner meals: 1 unique recipe repeated
  - 5-8 lunch/dinner meals: 2 unique recipes repeated
  - 9-13 lunch/dinner meals: 3 unique recipes repeated
  - 14+ lunch/dinner meals: 4 unique recipes repeated

**Leftovers Logic:**
- Dinner recipes repeat as **next-day LUNCH** (not days apart)
- This saves cooking time: cook dinner, have leftovers for lunch tomorrow
- Example: Monday Dinner "Chicken Stir-Fry" → Tuesday Lunch "Chicken Stir-Fry"

**Important Behavior:**

| Optimize Grocery | Allow Repeats | Result |
|-----------------|---------------|--------|
| ✓ ON | ✓ ON | Fewer unique recipes with shared ingredients + repeats (max 2x each) |
| ✓ ON | ✗ OFF | All unique recipes with shared ingredients & protein diversity |
| ✗ OFF | ✓ ON | Can repeat recipes (max 2x each) to reduce cooking |
| ✗ OFF | ✗ OFF | All unique recipes with protein variety |

**When BOTH "Optimize Grocery" and "Allow Repeats" are disabled:**
- The AI prioritizes **authentic flavour and protein variety**
- Each recipe will use **different proteins** (chicken, beef, fish, pork, seafood, tofu, legumes, etc.)
- All recipes are unique with no repetition
- This is ideal for exploring diverse cuisines and protein options

**User Preferences & Special Requests:**
All optimization rules respect:
- Dietary restrictions and lifestyle requirements
- Special requests in the free-text field
- Stated dislikes and ingredient preferences
- Cultural and cuisine preferences
- No ingredients are used that conflict with user preferences

This feature is useful for busy schedules when you want to cook once and eat twice - perfect for batch cooking lunches or making extra dinner portions.

### API Rate Limiting
To prevent unauthorized API usage and manage costs, the app implements **client-side rate limiting** that tracks API calls per user:

**Rate Limits:**
- **300 API calls per hour** - Reset automatically each hour
- **1000 API calls per day** - Reset automatically at midnight
- **Tracking Note**: Generating 15 recipes = 15 API calls counted toward the limit

**How It Works:**
- Rate limit status is stored locally (AsyncStorage) and persists across app restarts
- Before each recipe generation, the app checks if remaining quota allows the request
- If limits are exceeded, a clear error message shows the reset time
- After successful generation, the counter is automatically incremented
- Windows reset automatically without user intervention

**Viewing Your Usage:**
- A small status bar at the bottom of the recipe generator shows:
  - "API Usage: 45/300 this hour • 250/1000 today"
  - Updates automatically after each recipe generation
  - Shows your remaining quota at a glance

**Error Handling:**
- Hourly limit exceeded: "Hourly limit exceeded. You've used 300/300 API calls this hour. Resets at [time]"
- Daily limit exceeded: "Daily limit exceeded. You've used 1000/1000 API calls today. Resets at [date] [time]"
- Users must wait for the window to reset before generating more recipes

**Future Enhancements:**
- Server-side rate limiting via Supabase Edge Functions (planned)
- Per-user custom limits based on subscription tier
- Cost tracking to monitor OpenAI spending

### Recipe Images

The app uses an intelligent image generation system that prioritizes quality food photos:

#### Image Source Priority
1. **Pexels API** (Primary) - High-quality, free food photography with intelligent matching
   - Searches using recipe **description keywords first** (e.g., "creamy Greek yogurt with berries")
   - Falls back to **recipe name** (e.g., "Greek Yogurt Parfait") if description keywords don't match
   - Uses generic food search as final fallback
   - Requires `EXPO_PUBLIC_PEXELS_API_KEY` environment variable

2. **Supabase Image Library** (Fallback) - Curated backup images
   - Used when Pexels API is not configured or all searches fail
   - Default fallback provides a quality food image

#### Configuration
To enable Pexels-powered image generation:
1. Get a free API key from [Pexels](https://www.pexels.com/api/)
2. Add it to your environment variables: `EXPO_PUBLIC_PEXELS_API_KEY=your_key_here`

#### Automatic Image Generation
- **AI-Generated Recipes**: Images are automatically fetched when recipes are generated
- **Curated Meal Plans**: Call `populateCuratedMealPlanImages()` to populate images for all meals in curated plans
  - This is available in `src/lib/curated-meal-plans.ts`
  - Images are derived from recipe description first, then recipe name
  - Pixabay is the primary source, Unsplash is the fallback

#### How It Works
- When a recipe is created, `generateRecipeImage(recipeName, recipeDescription)` is called
- The system extracts meaningful keywords from the recipe description (filtering out common words and cooking verbs)
- Searches Pixabay with these keywords first for the most contextually accurate image
- Falls back to recipe name and then generic food search if needed
- Ensures all recipes have beautiful, relevant images without manual configuration

All generated recipes respect your dietary restrictions, cuisine preferences, allergies, and cooking skill level.


### Recipe Generation - Parallel Approach
The app generates recipes using **parallel API calls** - all recipes are requested simultaneously for maximum speed while guaranteeing exact count.

**How it works:**
1. When you select 4 days + 3 meals = 12 recipes, the system fires 12 API calls at once
2. Each recipe is generated with a simple, focused prompt for that specific meal type
3. Recipes cycle through your selected meal types (e.g., breakfast, lunch, dinner, breakfast, lunch, dinner...)
4. All requests complete in parallel, dramatically reducing wait time
5. Grocery optimization suggests shared ingredients across all recipes

**Benefits:**
- **Guaranteed count**: Each recipe is its own API call - you get exactly what you requested
- **Fast**: 12 recipes generate in ~4-5 seconds instead of ~36 seconds
- **Reliable**: No batching issues or AI miscounting
- **Same cost**: Same number of tokens as sequential approach

**Result**: Selecting 4 days + 3 meals generates all 12 recipes quickly and accurately.

## Recipe Import

Import recipes from social media or any website using AI-powered extraction:

### How to Import
1. Go to the Recipes tab and tap the download icon (next to the + button)
2. Choose your import method:
   - **URL/Link**: Paste a URL from Instagram, TikTok, Pinterest, YouTube, or any recipe website
   - **Text/Recipe**: Paste recipe text, ingredients list, or description directly
3. Tap "Extract Recipe" to use AI to parse the content
4. Review and edit the extracted recipe details
5. Save to your recipe collection

### Supported Sources
- Instagram posts and reels
- TikTok videos
- Pinterest pins
- YouTube videos
- Any recipe website
- Plain text recipes

## Color Theme

The app uses a warm, earthy color palette:
- **Sage**: Primary green tones (#6a7d56)
- **Terracotta**: Accent orange tones (#e46d46)
- **Cream**: Light background (#fefdfb)
- **Charcoal**: Dark mode backgrounds (#262626)

## Paywall Screen

The app includes a premium paywall screen (`src/app/paywall.tsx`) that showcases subscription options:

### Features
- **Premium Features Display**: Shows key premium features with icons (AI Recipe Generation, Unlimited Meal Planning, Smart Grocery Lists, Curated Meal Plans)
- **Plan Selection**: Users can choose between Monthly (AUD 5.99/month) and Yearly (AUD 57.49/year - 20% discount) subscriptions
- **Free Trial**: Both plans include a 1-month free trial period
- **Animated UI**: Smooth animations using React Native Reanimated for crown icon and plan selection
- **Dark/Light Mode**: Fully supports both color schemes with the app's earthy color palette
- **RevenueCat Integration**: Fetches real pricing from RevenueCat offerings and handles purchases
- **Restore Purchases**: Users can restore previous purchases with one tap
- **Web Fallback**: Shows a friendly message directing web users to the mobile app for subscriptions

### Navigation
Navigate to the paywall screen using:
```typescript
import { useRouter } from 'expo-router';
const router = useRouter();
router.push('/paywall');
```

### RevenueCat Products
- Monthly Package: `$rc_monthly` - AUD 5.99/month
- Yearly Package: `$rc_annual` - AUD 57.49/year (20% savings)
- Entitlement: `premium` - grants access to premium features

## Premium Subscription

The app supports premium subscriptions via RevenueCat, synced with Supabase for persistent user status.

### Subscription Features
- **Monthly Premium**: $4.99/month subscription
- **Premium Entitlement**: "premium" entitlement grants access to premium features
- **Cross-Platform**: Works on iOS and Android via RevenueCat
- **Persistent Status**: Subscription status synced to Supabase database

### Setup Requirements
1. **RevenueCat**: Configure via the Payments tab in Vibecode
2. **Supabase Users Table**: Run the following SQL in your Supabase SQL Editor:

```sql
-- Create users table for premium subscriptions and account management
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  revenuecat_customer_id TEXT,
  account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'deleted')),
  paused_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own data
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);
CREATE INDEX IF NOT EXISTS idx_users_revenuecat_customer_id ON users(revenuecat_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
```

**IMPORTANT**: The `users` table is required for the app to function properly. If users are being asked to log in every time they open the app or their data isn't being saved, make sure this table exists with proper RLS policies.

### Usage in Code
```typescript
import { useIsPremium } from '@/lib/subscription-store';

// Check premium status anywhere in your app
const isPremium = useIsPremium();

if (isPremium) {
  // Show premium features
}
```

## Account Management

Users can manage their account status in Settings:

### Pause Account
- **Subscription is paused** - billing stops during pause
- **View saved recipes** - users can still browse and view their recipe collection
- **Restricted features** - meal planning, AI recipe generation, and grocery list creation are disabled
- **Data is preserved** - all recipes, meal plans, and preferences are saved
- **Resume anytime** - restore full access with one tap
- When paused, restricted features show lock icons and "Account Paused" messages
- Users can still navigate the app and view their recipes

### Delete Account
- **Permanently removes all user data** from the database
- Deletes: recipes, meal plans, grocery items, and preferences
- User account is soft-deleted (marked as deleted for audit trail)
- After deletion, user is logged out and redirected to login screen
- **This action cannot be undone**

### Database Updates Required
Add these columns to your `users` table in Supabase:

```sql
-- Add account status columns to users table
ALTER TABLE users
ADD COLUMN account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'deleted')),
ADD COLUMN paused_at TIMESTAMPTZ,
ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index for account status queries
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
```

### Usage in Code
```typescript
import { useAccountStatus, useIsAccountPaused } from '@/lib/subscription-store';

// Check if account is paused
const isPaused = useIsAccountPaused();

// Get full account status ('active', 'paused', or 'deleted')
const accountStatus = useAccountStatus();

// Pause/Resume/Delete account
const { pauseAccount, resumeAccount, deleteAccount } = useSubscriptionStore();

// Pause account
await pauseAccount(userId);

// Resume account
await resumeAccount(userId);

// Delete account (removes all data)
await deleteAccount(userId);
```

## Performance Optimizations

The application implements several critical performance optimizations to ensure smooth user experience:

### 1. **Optimized Zustand Persistence**
- Only user preferences and profile are persisted to AsyncStorage
- Large datasets (recipes, meal slots, grocery items) are NOT persisted locally
- These are loaded fresh from Supabase on app startup
- This prevents blocking the UI thread with synchronous storage writes

### 2. **Debounced Database Syncs**
- Meal slot updates are debounced with 500ms delay
- Prevents cascading database calls when multiple updates happen rapidly
- Reduces unnecessary network traffic

### 3. **React.memo Optimization**
- MealCard components are wrapped in React.memo to prevent re-renders
- Callback functions are properly memoized to prevent prop changes

### 4. **Selective Store Subscriptions**
- Components subscribe only to the specific store slices they need
- Filtered data is calculated in useMemo to prevent recalculation
- Prevents unnecessary re-renders when unrelated store data changes

### 5. **UUID Detection for Recipes**
- Detects whether recipe IDs are from database (valid UUIDs) or temp IDs
- Prevents cascading updates for recipes that already exist in the database

These optimizations ensure the app remains responsive even with large datasets (36+ recipes, 20+ meal slots).

## Ingredient Aggregation System

The app implements intelligent ingredient quantity aggregation to ensure the same ingredient never appears as multiple lines, even when added with different units.

### Core Features

1. **Automatic Unit Conversion**
   - All ingredients are converted to canonical base units for storage
   - Volume → millilitres (ml)
   - Weight → grams (g)
   - Count → pieces
   - Supports: cups, tbsp, tsp, ml, l, g, kg, oz, lb, and count units (cans, heads, stalks, slices, strips, etc.)

2. **Smart Combining**
   - When generating grocery lists, ingredients are combined using their base units
   - Example: "2 cups olive oil" + "2 tbsp olive oil" = One line showing "2 cups + 2 tbsp"
   - Works across recipes and meal options
   - Prevents duplicate rows for the same ingredient

3. **Smart Display Formatting**
   - Never mixes incompatible unit systems in display (e.g., no "tbsp ml" combinations)
   - Strict unit system rules:
     - **Volumes ≥ 1 cup**: Uses cups + tbsp (e.g., "2 cups + 2 tbsp")
     - **Volumes 1 tbsp to <1 cup**: Uses tbsp + tsp (e.g., "3 tbsp + 2 tsp")
     - **Volumes <1 tbsp**: Uses tsp only (e.g., "2 tsp")
     - **Very small volumes <5ml**: Uses ml as fallback (e.g., "3 ml")
     - **Weights ≥ 1kg**: Uses kg only (e.g., "1.5 kg")
     - **Weights <1kg**: Uses g only (e.g., "250 g")
   - Maximum of 2 units per ingredient, always from the same system
   - Example display results:
     - 510 ml → "2 cups + 2 tbsp" ✓
     - 30 ml → "2 tbsp" ✓
     - 7 ml → "1.5 tsp" ✓
     - Never shows: "2 tbsp + 10 ml" ✗, "2 cups ml" ✗

4. **Manual Ingredient Addition**
   - When manually adding items to grocery list, automatically combines with existing ingredients
   - Normalizes ingredient names to handle variations (e.g., "yogurt" vs "yoghurt")

### Intelligent Normalization Pipeline

The system uses a sophisticated four-stage normalization and aggregation pipeline:

**Stage 1: Name Normalization**
- Strips cooking descriptors: raw, cooked, boneless, skinless, chopped, diced, etc.
- Resolves aliases: "chicken breast" → "chicken", "bell pepper" → "pepper", etc.
- Example: "Fresh boneless chicken breast, chopped" → canonical name: "chicken"

**Stage 2: Unit Type Classification**
- Classifies each ingredient into one of three types:
  - **WEIGHT**: Measured in g or kg
  - **VOLUME**: Measured in mL or L
  - **COUNT**: Measured in pieces, cloves, cans, etc.

**Stage 3: Confidence-Based Aggregation**
- **Rule 1 - Same Type Direct Sum**: If same ingredient appears with same unit type, simply add them
  - Example: "Chicken 300g" + "Chicken 500g" → "Chicken 800g"
- **Rule 2 - Count + Weight Smart Conversion**: If ingredient appears as both COUNT and WEIGHT, convert using confidence-based lookup
  - Uses Australian average weight data with confidence levels (high/medium/low)
  - High/medium confidence entries are automatically converted; low/missing stay separate
  - Example: "Chicken 4 pieces" + "Chicken 500g" → "Chicken 1.3 kg" (if lookup exists and confidence is high/medium)
  - 50+ ingredients supported with Australian standard average weights
- **Rule 3 - Mixed Types Graceful Degradation**: If ingredients can't be converted, keep as separate lines
  - Ensures no data loss when conversions aren't available

**Stage 4: Display Rounding**
- Quantities rounded to nearest 5g/mL for user-friendly numbers
- Examples: 127g → 125g, 34mL → 35mL

### Confidence-Based Conversion Metadata

When count-to-weight conversions are applied, metadata is tracked internally (never shown to users):
- **Conversion source**: Australian average weight lookup
- **Confidence level**: HIGH (standard portions), MEDIUM (variable by variety), LOW (highly variable), or MISSING (no data)
- **Conversion details**: Original quantity/unit → Converted quantity/unit

Example conversions (HIGH confidence):
- Chicken breast: 200g per piece
- Garlic clove: 5g per clove
- Egg: 55g per piece
- Salmon: 200g per piece

Example conversions (MEDIUM confidence):
- Onion: 150g per medium onion
- Tomato: 150g per medium tomato
- Potato: 200g per medium potato
- Bell pepper: 180g per pepper

### Implementation Details

**Files involved:**
- `src/lib/unit-conversion.ts` - Core unit conversion logic with strict formatting rules
- `src/lib/ingredient-normalizer.ts` - Name normalization, descriptor stripping, unit type classification
- `src/lib/average-weight-lookup-au.ts` - Australian ingredient average weights with confidence levels
- `src/lib/intelligent-aggregation.ts` - Confidence-based aggregation with conversion tracking
- `src/lib/ingredient-aggregation.ts` - Aggregation helpers and bridging functions
- `src/lib/conversion-metadata.ts` - Conversion tracking and auditing (internal only)
- `src/lib/store.ts` - Updated generateGroceryList and addGroceryItem functions

**Storage:**
- Ingredients store both display and base unit quantities
- Fields: `quantity`, `unit`, `quantity_base`, `base_unit`
- Only base unit fields are used for combining, display fields for UI

**Supported Count Units:**
- Single items: can, cans, jar, jars, bottle, bottles, head, heads
- Produce parts: slice, slices, strip, strips, stalk, stalks, clove, cloves, bulb, bulbs, bunch, bunches
- Measurements: whole, piece, pieces, handful, handfuls, pinch, pinches

### Ingredient Unit Validation System

The app includes an **intelligent ingredient validation layer** that prevents incorrect unit assignments during recipe creation. This ensures all ingredients display with appropriate units in the grocery list.

**How It Works:**

1. **Automatic Classification**: Each ingredient is classified into a category (PROTEIN, VEGETABLE, FRUIT, GRAIN, LIQUID, DAIRY, OTHER)
2. **Strict Unit Type Rules**: Each category only allows specific unit types
   - PROTEIN (chicken, protein bars, tofu, etc.): Only WEIGHT (g/kg) or COUNT (pieces/bars/whole)
   - VEGETABLE (onion, carrot, lettuce, etc.): Only WEIGHT (g/kg) or COUNT (pieces/heads/stalks)
   - FRUIT (apple, banana, lemon, etc.): Only WEIGHT (g/kg) or COUNT (pieces/whole)
   - LIQUID (milk, oil, water, etc.): Only VOLUME (mL/L)
   - GRAIN (rice, pasta, flour, etc.): Only WEIGHT (g/kg) or DRY VOLUME (cups/tbsp)
   - DAIRY (cheese, butter, yogurt, etc.): WEIGHT (g/kg), VOLUME (mL/L), or COUNT (pieces)

3. **Validation & Correction**: When a recipe is created/imported, all ingredients are validated:
   - If unit type doesn't match the ingredient category, it's automatically corrected
   - Example: "Protein bar: 1g" → Detected as PROTEIN, but unit=g (WEIGHT) is allowed → Keeps as is
   - Example: "Onion: 500mL" → Detected as VEGETABLE, but VOLUME not allowed → Corrected to "500g"
   - Example: "Chicken: 1 tbsp" → Detected as PROTEIN, but DRY VOLUME not allowed → Corrected to "15g"

4. **Applied During Recipe Save**: Validation runs automatically when you:
   - Manually add a recipe (`add-recipe.tsx`)
   - Import a recipe from URL/text (`import-review.tsx`)
   - Generate recipes with AI (`generate-recipe.tsx`)

5. **Real-Time Correction**: Invalid units are silently corrected to sensible defaults:
   - Countable items like "protein bars" are ensured to use COUNT units (piece, bar, whole)
   - Missing units are auto-assigned based on ingredient type
   - Unknown units are replaced with the fallback for that ingredient category

**Example Fix:**
- **Issue**: Store-bought protein bar added with "1 g" unit (from incomplete recipe)
- **What Happens**: Ingredient validator detects "protein bar" is PROTEIN category, which allows COUNT units
- **Result**: Unit is corrected and grocery list shows "6 bars" instead of "6 g"

**Files Involved:**
- `src/lib/ingredient-validator.ts` - Main validation logic with defaults
- `src/lib/ingredient-unit-rules.ts` - Category rules and unit type definitions
- `src/app/add-recipe.tsx` - Calls validateIngredients before saving
- `src/app/import-review.tsx` - Calls validateIngredients before saving
- `src/app/generate-recipe.tsx` - Calls validateIngredients for AI recipes

### Acceptance Tests

All aggregation logic is verified by comprehensive acceptance tests:
1. **High-Confidence Conversion** (Chicken): 4 pieces + 500g → 1.3 kg ✓
2. **Medium-Confidence Conversion** (Onion): 2 medium + 300g → 600g ✓
3. **High-Confidence Conversion** (Garlic): 3 cloves + 10g → 25g ✓
4. **Graceful Degradation** (Unknown): Unknown ingredient stays separate when conversion unavailable ✓
5. **UI Output Privacy**: Conversion metadata never exposed to UI ✓
6. **Direct Sum** (Same type): 300g + 500g → 800g (no conversion) ✓
7. **Rounding**: Display values rounded to nearest 5 for user-friendly numbers ✓
8. **Volume-Only** (No conversion): 200ml + 300ml → 500ml ✓
9. **Count-Only** (No conversion): 2 pieces + 3 pieces → 5 pieces ✓

## UI/UX Improvements

### Saved Lists - Persistent Checked Items & Reliable Deletion
- **Fixed Issue**: Checked items are now properly persisted when saving and reloading saved lists
  - When you check 2 items in a 40-item list and save it, you'll see 2/40 with checked items at the bottom
  - When you revisit the list later, all 40 items remain with the same 2 items still checked
  - Checked items are displayed at the bottom of each category with a "Completed" divider
- **Fixed Issue**: Deleted saved lists no longer reappear after logout/login
  - Deletion now properly syncs to the database using upsert operations
  - Better error handling and logging for delete operations
  - Async operations properly await database confirmation
- **Implementation**: Updated database operations to use upsert instead of delete-then-insert pattern

### Done Button Text Alignment Fix
- **Issue**: "Done" button text in AI Recipe Generator modals was wrapping into two lines ("Don" / "e"), creating poor readability
- **Location**: `src/app/generate-recipe.tsx` - Select Recipes modal and Edit Preferences modal
- **Solution**: Removed fixed width constraints (`w-10`, `w-16`) that forced text wrapping and added `whitespace-nowrap` to prevent line breaks
- **Result**: Button text now displays on a single line with proper alignment

### Quick Add Section Enhancement
- **Feature**: The Quick Add section on the Meal Plan screen displays 9 recipes in a single horizontal scroll:
  - **Backend Logic**: Recipes are intelligently sorted in three priority categories:
    1. **Most Repeated** - Recipes used most in the last 2 weeks (3 recipes)
    2. **Your Preferences** - Recipes matching dietary restrictions and cuisine preferences (3 recipes)
    3. **Favorites** - Your saved/favorite recipes (3 recipes)
  - **Smart Deduplication**: Recipes are excluded from appearing in multiple categories
  - **UI**: All 9 recipes displayed in a single continuous horizontal scroll with no category headers
- **Implementation**: `src/lib/quick-add-logic.ts` contains the filtering and sorting logic
- **Benefits**: Clean, streamlined UI while maintaining intelligent recipe prioritization in the backend

### Curated Meal Plan - Apply Button Freeze Fix
- **Issue**: "Apply Plan" button was freezing the app when clicked due to heavy synchronous computation
- **Root Cause**: The `applyCuratedMealPlan` function performs validation and processing for 15-25 recipes synchronously, blocking the UI thread
- **Solution**:
  - Immediately update UI state (`setIsApplying(true)`) to show "Applying..." loading state
  - Give React 100ms to render the UI update before starting heavy computation
  - Execute meal plan application after UI has updated
  - Added comprehensive debug logging for troubleshooting
- **Result**: Button now shows immediate feedback and doesn't freeze the app

### Select Recipes Screen - Persist Previous Selections
- **Issue**: When user adds multiple meals to a category (e.g., Breakfast) and then reopens the Select Recipes screen for the same category, the previously added meals were not shown as selected (checkmarks removed)
- **Root Cause**: The `selectedRecipeIds` state was initialized as empty array, not loading existing recipes from meal slots for that meal type/date
- **Solution**:
  - Created `initialSelectedRecipeIds` using `useMemo` to query meal slots on screen load
  - Filter meal slots by matching date + meal type from route params
  - Automatically populate checkmarks for all recipes already in meal slots for that category
- **Implementation Details** (`src/app/select-recipe.tsx`):
  - Query `mealSlots` filtered by `slot.date === initialDate && initialMealTypes.includes(slot.mealType)`
  - Extract `recipeId` from matching slots
  - Initialize `selectedRecipeIds` state with these IDs
- **Result**: When reopening Select Recipes for the same meal type/date, all previously added recipes show with checkmarks ✓

### Grocery List Ingredient Aggregation Fixes
- **Hard Boiled Eggs Not Combining with Eggs**: Added aliases for egg variations to the ingredient normalizer
  - Now "hard boiled eggs", "hard-boiled eggs", "boiled eggs", "soft boiled eggs", "poached eggs", "fried eggs", "scrambled eggs" all combine with "eggs"
  - **File**: `src/lib/ingredient-normalizer.ts` - Added egg aliases to aliasMap
- **Cinnamon 0.5 tsp Showing as "0"**: Fixed rounding bug in small quantity display
  - The issue: `Math.round(0.5)` returns 0 in JavaScript (banker's rounding)
  - When 0.5 tsp converts to cups (0.0104 cups) and back to tsp, `Math.round(0.5)` = 0
  - **Solution**: Use `Math.ceil` for fractional tsp values to ensure minimum display of 1 tsp
  - **File**: `src/lib/unit-conversion.ts` - Updated `formatFromBaseUnit` function
- **Default Volume Type for Unknown Ingredients**: Changed default from 'liquid' to 'solid'
  - When an ingredient name is empty/missing during conversion, it now defaults to treating cups as cups (solid) instead of converting to mL (liquid)
  - This prevents ingredients measured in cups from incorrectly showing in mL
  - **File**: `src/lib/unit-conversion.ts` - Updated `convertToBaseUnit` function
- **Character Limit on Grocery List Items**: No hard character limit exists
  - Item names in the grocery list can wrap to multiple lines
  - Only the match suggestion modal uses `numberOfLines={1}` for compact display
  - This is intentional to allow full ingredient names to be visible

