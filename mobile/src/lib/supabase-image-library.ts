/**
 * Supabase Image Library
 *
 * This module provides a local image library for AI-generated recipes.
 * It matches recipe names and ingredients against a curated set of images
 * stored in Supabase, falling back to Pexels if no match is found.
 */

export interface ImageLibraryEntry {
  systemTag: string;
  displayTag: string;
  primaryIngredients: string[];
  publicUrl: string;
}

// Image library data from Supabase backup images
export const IMAGE_LIBRARY: ImageLibraryEntry[] = [
  { systemTag: "apple_pie", displayTag: "Apple Pie", primaryIngredients: ["apples", "pastry", "cinnamon", "sugar", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/apple_pie.png" },
  { systemTag: "asparagus", displayTag: "Asparagus", primaryIngredients: ["asparagus", "olive oil", "salt", "garlic"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/asparagus.png" },
  { systemTag: "avocado_toast", displayTag: "Avocado Toast", primaryIngredients: ["avocado", "bread", "salt", "pepper", "lemon"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/avocado_toast.png" },
  { systemTag: "avocados", displayTag: "Avocados", primaryIngredients: ["avocado"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/avocados.png" },
  { systemTag: "bagels_with_cream_cheese", displayTag: "Bagels With Cream Cheese", primaryIngredients: ["bagel", "cream cheese"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/bagels_with_cream_cheese.png" },
  { systemTag: "baked_potato", displayTag: "Baked Potato", primaryIngredients: ["potato", "butter", "sour cream", "chives", "cheese"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/baked_potato.png" },
  { systemTag: "banana_bread", displayTag: "Banana Bread", primaryIngredients: ["bananas", "flour", "sugar", "eggs", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/banana_bread.png" },
  { systemTag: "beef_stroganoff", displayTag: "Beef Stroganoff", primaryIngredients: ["beef", "mushrooms", "sour cream", "pasta", "onion"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/beef_stroganoff.png" },
  { systemTag: "beef_tacos", displayTag: "Beef Tacos", primaryIngredients: ["beef", "taco shells", "cheese", "lettuce", "salsa"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/beef_tacos.png" },
  { systemTag: "berries", displayTag: "Berries", primaryIngredients: ["strawberries", "blueberries", "raspberries", "blackberries"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/berries.png" },
  { systemTag: "berry_pie", displayTag: "Berry Pie", primaryIngredients: ["berries", "pastry", "sugar", "butter", "flour"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/berry_pie.png" },
  { systemTag: "birthday_cake", displayTag: "Birthday Cake", primaryIngredients: ["flour", "sugar", "eggs", "butter", "frosting", "vanilla"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/birthday_cake.png" },
  { systemTag: "breakfast_burrito", displayTag: "Breakfast Burrito", primaryIngredients: ["eggs", "sausage", "cheese", "tortilla", "salsa"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/breakfast_burrito.png" },
  { systemTag: "breakfast_sandwich_bacon_egg_cheese", displayTag: "Breakfast Sandwich Bacon Egg Cheese", primaryIngredients: ["bacon", "egg", "cheese", "bread"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/breakfast_sandwich_bacon_egg_cheese.png" },
  { systemTag: "brownies", displayTag: "Brownies", primaryIngredients: ["chocolate", "flour", "sugar", "eggs", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/brownies.png" },
  { systemTag: "bruschetta", displayTag: "Bruschetta", primaryIngredients: ["tomatoes", "bread", "basil", "garlic", "olive oil"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/bruschetta.png" },
  { systemTag: "brussels_sprouts", displayTag: "Brussels Sprouts", primaryIngredients: ["brussels sprouts", "bacon", "olive oil", "salt", "pepper"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/brussels_sprouts.png" },
  { systemTag: "buffalo_chicken_dip", displayTag: "Buffalo Chicken Dip", primaryIngredients: ["chicken", "hot sauce", "cream cheese", "cheddar", "ranch"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/buffalo_chicken_dip.png" },
  { systemTag: "caesar_salad", displayTag: "Caesar Salad", primaryIngredients: ["romaine lettuce", "croutons", "parmesan", "caesar dressing"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/caesar_salad.png" },
  { systemTag: "cappuccino", displayTag: "Cappuccino", primaryIngredients: ["espresso", "milk", "foam"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cappuccino.png" },
  { systemTag: "carbonara", displayTag: "Carbonara", primaryIngredients: ["pasta", "eggs", "pancetta", "parmesan", "black pepper"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/carbonara.png" },
  { systemTag: "carrot_cake", displayTag: "Carrot Cake", primaryIngredients: ["carrots", "flour", "sugar", "eggs", "cream cheese frosting"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/carrot_cake.png" },
  { systemTag: "charcuterie_board", displayTag: "Charcuterie Board", primaryIngredients: ["cheese", "cured meats", "crackers", "fruit", "nuts"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/charcuterie_board.png" },
  { systemTag: "cheese_ball", displayTag: "Cheese Ball", primaryIngredients: ["cream cheese", "cheddar", "pecans", "herbs"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cheese_ball.png" },
  { systemTag: "cheese_board", displayTag: "Cheese Board", primaryIngredients: ["cheese", "crackers", "grapes", "honey", "nuts"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cheese_board.png" },
  { systemTag: "cheesecake", displayTag: "Cheesecake", primaryIngredients: ["cream cheese", "graham crackers", "sugar", "eggs", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cheesecake.png" },
  { systemTag: "chia_pudding", displayTag: "Chia Pudding", primaryIngredients: ["chia seeds", "milk", "honey", "vanilla"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/chia_pudding.png" },
  { systemTag: "chicken_wings", displayTag: "Chicken Wings", primaryIngredients: ["chicken wings", "hot sauce", "butter", "spices"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/chicken_wings.png" },
  { systemTag: "chili_beef_or_vegetarian", displayTag: "Chili Beef Or Vegetarian", primaryIngredients: ["beef", "beans", "tomatoes", "chili powder", "onion"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/chili_beef_or_vegetarian.png" },
  { systemTag: "chocolate_cake", displayTag: "Chocolate Cake", primaryIngredients: ["chocolate", "flour", "sugar", "eggs", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/chocolate_cake.png" },
  { systemTag: "chocolate_chip_cookies", displayTag: "Chocolate Chip Cookies", primaryIngredients: ["flour", "butter", "sugar", "chocolate chips", "eggs"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/chocolate_chip_cookies.png" },
  { systemTag: "cinnamon_rolls", displayTag: "Cinnamon Rolls", primaryIngredients: ["flour", "butter", "sugar", "cinnamon", "icing"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cinnamon_rolls.png" },
  { systemTag: "cobb_salad", displayTag: "Cobb Salad", primaryIngredients: ["chicken", "bacon", "eggs", "blue cheese", "avocado", "lettuce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cobb_salad.png" },
  { systemTag: "coffee_latte", displayTag: "Coffee Latte", primaryIngredients: ["espresso", "milk"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/coffee_latte.png" },
  { systemTag: "coleslaw", displayTag: "Coleslaw", primaryIngredients: ["cabbage", "carrots", "mayonnaise", "vinegar", "sugar"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/coleslaw.png" },
  { systemTag: "corn_on_the_cob", displayTag: "Corn On The Cob", primaryIngredients: ["corn", "butter", "salt"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/corn_on_the_cob.png" },
  { systemTag: "crab_cakes", displayTag: "Crab Cakes", primaryIngredients: ["crab meat", "breadcrumbs", "mayonnaise", "egg", "old bay"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/crab_cakes.png" },
  { systemTag: "crepes", displayTag: "Crepes", primaryIngredients: ["flour", "milk", "eggs", "butter", "sugar"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/crepes.png" },
  { systemTag: "croissants", displayTag: "Croissants", primaryIngredients: ["flour", "butter", "yeast", "sugar", "milk"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/croissants.png" },
  { systemTag: "cucumber_salad", displayTag: "Cucumber Salad", primaryIngredients: ["cucumber", "onion", "vinegar", "dill"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cucumber_salad.png" },
  { systemTag: "cupcakes", displayTag: "Cupcakes", primaryIngredients: ["flour", "sugar", "eggs", "butter", "frosting"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/cupcakes.png" },
  { systemTag: "curry_chicken_chickpea", displayTag: "Curry Chicken Chickpea", primaryIngredients: ["chicken", "chickpeas", "curry powder", "coconut milk", "onions"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/curry_chicken_chickpea.png" },
  { systemTag: "deviled_eggs", displayTag: "Deviled Eggs", primaryIngredients: ["eggs", "mayonnaise", "mustard", "paprika"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/deviled_eggs.png" },
  { systemTag: "donuts", displayTag: "Donuts", primaryIngredients: ["flour", "sugar", "yeast", "milk", "butter", "glaze"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/donuts.png" },
  { systemTag: "dumplings_potstickers", displayTag: "Dumplings Potstickers", primaryIngredients: ["pork", "cabbage", "wrappers", "soy sauce", "ginger"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/dumplings_potstickers.png" },
  { systemTag: "edamame", displayTag: "Edamame", primaryIngredients: ["edamame", "salt", "soybeans"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/edamame.png" },
  { systemTag: "eggplant_parmesan", displayTag: "Eggplant Parmesan", primaryIngredients: ["eggplant", "tomato sauce", "mozzarella", "parmesan", "breadcrumbs"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/eggplant_parmesan.png" },
  { systemTag: "eggs_benedict", displayTag: "Eggs Benedict", primaryIngredients: ["english muffin", "ham", "eggs", "hollandaise sauce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/eggs_benedict.png" },
  { systemTag: "enchiladas", displayTag: "Enchiladas", primaryIngredients: ["tortillas", "chicken", "beef", "cheese", "enchilada sauce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/enchiladas.png" },
  { systemTag: "falafel", displayTag: "Falafel", primaryIngredients: ["chickpeas", "parsley", "garlic", "cumin", "coriander"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/falafel.png" },
  { systemTag: "fettuccine_alfredo", displayTag: "Fettuccine Alfredo", primaryIngredients: ["fettuccine", "butter", "parmesan", "heavy cream"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fettuccine_alfredo.png" },
  { systemTag: "fish_and_chips", displayTag: "Fish And Chips", primaryIngredients: ["fish", "potatoes", "flour", "beer", "oil"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fish_and_chips.png" },
  { systemTag: "fish_tacos", displayTag: "Fish Tacos", primaryIngredients: ["fish", "tortillas", "cabbage", "lime", "white sauce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fish_tacos.png" },
  { systemTag: "french_fries", displayTag: "French Fries", primaryIngredients: ["potatoes", "oil", "salt"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/french_fries.png" },
  { systemTag: "french_toast", displayTag: "French Toast", primaryIngredients: ["bread", "eggs", "milk", "cinnamon", "maple syrup"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/french_toast.png" },
  { systemTag: "fried_rice", displayTag: "Fried Rice", primaryIngredients: ["rice", "eggs", "peas", "carrots", "soy sauce", "green onions"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fried_rice.png" },
  { systemTag: "frittata", displayTag: "Frittata", primaryIngredients: ["eggs", "cheese", "spinach", "onions", "bell peppers"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/frittata.png" },
  { systemTag: "fruit_crisp_cobbler", displayTag: "Fruit Crisp Cobbler", primaryIngredients: ["fruit", "oats", "flour", "sugar", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fruit_crisp_cobbler.png" },
  { systemTag: "fruit_salad", displayTag: "Fruit Salad", primaryIngredients: ["melons", "berries", "grapes", "pineapple", "apples"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/fruit_salad.png" },
  { systemTag: "garden_salad", displayTag: "Garden Salad", primaryIngredients: ["lettuce", "tomatoes", "cucumbers", "carrots", "vinaigrette"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/garden_salad.png" },
  { systemTag: "garlic_bread", displayTag: "Garlic Bread", primaryIngredients: ["bread", "garlic", "butter", "parsley"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/garlic_bread.png" },
  { systemTag: "grain_bowls", displayTag: "Grain Bowls", primaryIngredients: ["quinoa", "brown rice", "vegetables", "protein", "dressing"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/grain_bowls.png" },
  { systemTag: "granola_yogurt_parfait", displayTag: "Granola Yogurt Parfait", primaryIngredients: ["yogurt", "granola", "berries", "honey"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/granola_yogurt_parfait.png" },
  { systemTag: "greek_salad", displayTag: "Greek Salad", primaryIngredients: ["tomatoes", "cucumbers", "red onions", "feta", "olives", "olive oil"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/greek_salad.png" },
  { systemTag: "green_beans", displayTag: "Green Beans", primaryIngredients: ["green beans", "garlic", "olive oil", "salt"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/green_beans.png" },
  { systemTag: "grilled_salmon", displayTag: "Grilled Salmon", primaryIngredients: ["salmon", "lemon", "olive oil", "herbs"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/grilled_salmon.png" },
  { systemTag: "guacamole", displayTag: "Guacamole", primaryIngredients: ["avocados", "lime", "cilantro", "onions", "jalapeño"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/guacamole.png" },
  { systemTag: "gumbo", displayTag: "Gumbo", primaryIngredients: ["sausage", "shrimp", "chicken", "okra", "rice", "roux"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/gumbo.png" },
  { systemTag: "ham", displayTag: "Ham", primaryIngredients: ["ham", "honey", "cloves", "brown sugar"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/ham.png" },
  { systemTag: "hamburgers", displayTag: "Hamburgers", primaryIngredients: ["ground beef", "buns", "lettuce", "tomato", "cheese"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/hamburgers.png" },
  { systemTag: "hash_browns", displayTag: "Hash Browns", primaryIngredients: ["potatoes", "oil", "salt", "onion"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/hash_browns.png" },
  { systemTag: "hot_chocolate", displayTag: "Hot Chocolate", primaryIngredients: ["milk", "cocoa powder", "sugar", "marshmallows"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/hot_chocolate.png" },
  { systemTag: "hummus", displayTag: "Hummus", primaryIngredients: ["chickpeas", "tahini", "lemon", "garlic", "olive oil"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/hummus.png" },
  { systemTag: "ice_cream_scoops", displayTag: "Ice Cream Scoops", primaryIngredients: ["milk", "cream", "sugar", "vanilla"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/ice_cream_scoops.png" },
  { systemTag: "iced_tea", displayTag: "Iced Tea", primaryIngredients: ["tea", "water", "ice", "lemon", "sugar"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/iced_tea.png" },
  { systemTag: "jalapeno_poppers", displayTag: "Jalapeno Poppers", primaryIngredients: ["jalapeños", "cream cheese", "bacon", "cheddar"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/jalape_o_poppers.png" },
  { systemTag: "jambalaya", displayTag: "Jambalaya", primaryIngredients: ["rice", "sausage", "shrimp", "chicken", "bell peppers", "celery"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/jambalaya.png" },
  { systemTag: "lasagna", displayTag: "Lasagna", primaryIngredients: ["pasta", "ground beef", "ricotta", "mozzarella", "tomato sauce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/lasagna.png" },
  { systemTag: "leafy_greens", displayTag: "Leafy Greens", primaryIngredients: ["spinach", "kale", "arugula", "lettuce"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/leafy_greens.png" },
  { systemTag: "lemon_tart", displayTag: "Lemon Tart", primaryIngredients: ["lemons", "pastry", "sugar", "eggs", "butter"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/lemon_tart.png" },
  { systemTag: "lemonade", displayTag: "Lemonade", primaryIngredients: ["lemons", "water", "sugar", "ice"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/lemonade.png" },
  { systemTag: "lentil_shepherds_pie", displayTag: "Lentil Shepherds Pie", primaryIngredients: ["lentils", "potatoes", "carrots", "peas", "onions", "broth"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/lentil_shepherd_s_pie.png" },
  { systemTag: "lobster_tail", displayTag: "Lobster Tail", primaryIngredients: ["lobster", "butter", "lemon", "garlic", "parsley"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/lobster_tail.png" },
  { systemTag: "macaroni_and_cheese", displayTag: "Macaroni And Cheese", primaryIngredients: ["macaroni", "cheddar", "milk", "butter", "flour"], publicUrl: "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/backupimages/macaroni_and_cheese.png" },
  // ===== SOUP RECIPES - Using placeholder URLs, will be fetched from Pexels =====
  { systemTag: "mushroom_soup", displayTag: "Mushroom Soup", primaryIngredients: ["mushrooms", "broth", "onion", "cream", "garlic"], publicUrl: "https://images.pixabay.com/photos/soup-mushroom-soup-healthy-food-1968084-1280.jpg" },
  { systemTag: "tomato_soup", displayTag: "Tomato Soup", primaryIngredients: ["tomatoes", "broth", "cream", "onion", "basil"], publicUrl: "https://images.pixabay.com/photos/tomato-soup-soup-tomato-cream-3800320-1280.jpg" },
  { systemTag: "chicken_soup", displayTag: "Chicken Soup", primaryIngredients: ["chicken", "broth", "carrots", "celery", "onion"], publicUrl: "https://images.pixabay.com/photos/chicken-soup-warm-winter-food-5508199-1280.jpg" },
  { systemTag: "vegetable_soup", displayTag: "Vegetable Soup", primaryIngredients: ["vegetables", "broth", "carrots", "celery", "onion"], publicUrl: "https://images.pixabay.com/photos/vegetable-soup-healthy-food-nutrition-3441238-1280.jpg" },
  { systemTag: "minestrone_soup", displayTag: "Minestrone Soup", primaryIngredients: ["pasta", "vegetables", "broth", "tomatoes", "beans"], publicUrl: "https://images.pixabay.com/photos/minestrone-soup-vegetable-soup-2639395-1280.jpg" },
  { systemTag: "clam_chowder", displayTag: "Clam Chowder", primaryIngredients: ["clams", "potatoes", "cream", "broth", "onion"], publicUrl: "https://images.pixabay.com/photos/clam-chowder-soup-creamy-seafood-5638733-1280.jpg" },
  { systemTag: "lentil_soup", displayTag: "Lentil Soup", primaryIngredients: ["lentils", "broth", "carrots", "celery", "onion"], publicUrl: "https://images.pixabay.com/photos/lentil-soup-healthy-eating-nutrition-2559734-1280.jpg" },
  { systemTag: "broccoli_cheddar_soup", displayTag: "Broccoli Cheddar Soup", primaryIngredients: ["broccoli", "cheddar", "cream", "broth", "onion"], publicUrl: "https://images.pixabay.com/photos/broccoli-soup-cream-soup-healthy-2821835-1280.jpg" },
  { systemTag: "butternut_squash_soup", displayTag: "Butternut Squash Soup", primaryIngredients: ["butternut squash", "broth", "cream", "onion", "sage"], publicUrl: "https://images.pixabay.com/photos/butternut-squash-soup-pumpkin-soup-5624894-1280.jpg" },
  { systemTag: "pea_soup", displayTag: "Pea Soup", primaryIngredients: ["peas", "broth", "ham", "carrots", "onion"], publicUrl: "https://images.pixabay.com/photos/pea-soup-soup-vegetable-eating-2833396-1280.jpg" },
];

// Words to ignore when matching recipe names (cooking methods, articles, etc.)
const IGNORE_WORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'or', 'in', 'on', 'for', 'of', 'to',
  'one', 'pan', 'pot', 'sheet', 'skillet', 'oven', 'slow', 'cooker', 'instant',
  'easy', 'quick', 'simple', 'best', 'homemade', 'classic', 'traditional',
  'baked', 'roasted', 'grilled', 'fried', 'sauteed', 'steamed', 'braised',
  'crispy', 'creamy', 'spicy', 'sweet', 'savory', 'healthy', 'delicious',
  'minute', 'minutes', 'hour', 'hours', 'style', 'recipe'
]);

// Primary proteins - these are CRITICAL for matching
const PROTEINS = new Set([
  'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'lobster', 'crab',
  'turkey', 'lamb', 'duck', 'ham', 'bacon', 'sausage', 'tofu', 'tempeh',
  'eggs', 'egg', 'tuna', 'cod', 'tilapia', 'steak', 'meatball', 'meatballs'
]);

// Key dish types that should match
const DISH_TYPES = new Set([
  'salad', 'soup', 'stew', 'curry', 'pasta', 'rice', 'noodles', 'sandwich',
  'burger', 'tacos', 'burrito', 'pizza', 'casserole', 'stir fry', 'stirfry',
  'pie', 'cake', 'bread', 'toast', 'pancakes', 'waffles', 'omelette', 'frittata'
]);

/**
 * Normalizes a string for comparison by:
 * - Converting to lowercase
 * - Removing special characters and extra spaces
 * - Handling common variations (e.g., "and" vs "&")
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts meaningful words from a recipe name, filtering out noise
 */
function extractMeaningfulWords(name: string): string[] {
  const normalized = normalizeString(name);
  return normalized.split(' ').filter(word =>
    word.length > 2 && !IGNORE_WORDS.has(word)
  );
}

/**
 * Normalizes an ingredient name for matching
 * Handles plurals and common variations
 */
function normalizeIngredient(ingredient: string): string {
  let normalized = normalizeString(ingredient);

  // Remove common suffixes for better matching
  normalized = normalized
    .replace(/\s*(breast|thigh|drumstick|fillet|steak|chop)s?$/i, '')
    .replace(/\s*(fresh|frozen|canned|dried)$/i, '')
    .replace(/\s*(chopped|diced|sliced|minced|ground)$/i, '');

  // Handle common plurals
  if (normalized.endsWith('ies')) {
    normalized = normalized.slice(0, -3) + 'y'; // berries -> berry
  } else if (normalized.endsWith('es') && !normalized.endsWith('cheese')) {
    normalized = normalized.slice(0, -2); // tomatoes -> tomato
  } else if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
    normalized = normalized.slice(0, -1); // apples -> apple
  }

  return normalized;
}

/**
 * Checks if two words match (exact or one contains the other, with minimum length)
 */
function wordsMatch(word1: string, word2: string): boolean {
  if (word1 === word2) return true;
  // Only allow contains match if both words are meaningful length
  if (word1.length >= 4 && word2.length >= 4) {
    return word1.includes(word2) || word2.includes(word1);
  }
  return false;
}

/**
 * Extracts the primary protein from recipe name or ingredients
 */
function extractProtein(recipeName: string, ingredients: string[]): string | null {
  const normalizedName = normalizeString(recipeName);
  const nameWords = normalizedName.split(' ');

  // Check recipe name first
  for (const word of nameWords) {
    if (PROTEINS.has(word)) {
      return word;
    }
  }

  // Check ingredients
  for (const ing of ingredients) {
    const normalized = normalizeIngredient(ing);
    for (const protein of PROTEINS) {
      if (normalized === protein || normalized.includes(protein)) {
        return protein;
      }
    }
  }

  return null;
}

/**
 * Checks if the library entry contains the specified protein
 */
function entryHasProtein(entry: ImageLibraryEntry, protein: string): boolean {
  // Check display tag
  if (normalizeString(entry.displayTag).includes(protein)) {
    return true;
  }

  // Check ingredients
  for (const ing of entry.primaryIngredients) {
    const normalized = normalizeIngredient(ing);
    if (normalized === protein || normalized.includes(protein)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates a match score between a recipe and an image library entry
 * Returns a score from 0 to 1, where 1 is a perfect match
 *
 * CRITICAL: If the recipe has a protein (chicken, beef, etc.), the image MUST contain that protein
 */
function calculateMatchScore(
  recipeName: string,
  recipeIngredients: string[],
  entry: ImageLibraryEntry
): number {
  const normalizedRecipeName = normalizeString(recipeName);
  const normalizedDisplayTag = normalizeString(entry.displayTag);
  const normalizedSystemTag = normalizeString(entry.systemTag.replace(/_/g, ' '));

  // CRITICAL: Check protein matching first
  const recipeProtein = extractProtein(recipeName, recipeIngredients);
  if (recipeProtein) {
    // If recipe has a protein, the image MUST have that same protein
    if (!entryHasProtein(entry, recipeProtein)) {
      return 0; // Immediate disqualification - wrong protein or no protein
    }
  }

  let score = 0;

  // === NAME MATCHING ===

  // Exact match (highest score)
  if (normalizedRecipeName === normalizedDisplayTag || normalizedRecipeName === normalizedSystemTag) {
    return 1.0; // Perfect match
  }

  // Contains match (e.g., "Chicken Caesar Salad" contains "Caesar Salad")
  // But only if the contained string is meaningful (3+ words or specific dish)
  if (normalizedDisplayTag.length >= 8) {
    if (normalizedRecipeName.includes(normalizedDisplayTag)) {
      score += 0.7;
    } else if (normalizedDisplayTag.includes(normalizedRecipeName) && normalizedRecipeName.length >= 8) {
      score += 0.6;
    }
  }

  // Extract meaningful words for comparison
  const recipeWords = extractMeaningfulWords(recipeName);
  const tagWords = extractMeaningfulWords(entry.displayTag);

  if (recipeWords.length > 0 && tagWords.length > 0) {
    // Count exact word matches (not partial)
    let exactMatches = 0;
    const matchedWords: string[] = [];

    for (const recipeWord of recipeWords) {
      for (const tagWord of tagWords) {
        if (wordsMatch(recipeWord, tagWord)) {
          exactMatches++;
          matchedWords.push(recipeWord);
          break;
        }
      }
    }

    if (exactMatches > 0) {
      // Weight by proportion of tag words matched (important words in the image name)
      const matchRatio = exactMatches / tagWords.length;

      // Bonus for matching proteins or dish types
      const hasProteinMatch = matchedWords.some(w => PROTEINS.has(w));
      const hasDishTypeMatch = matchedWords.some(w => DISH_TYPES.has(w));

      let wordScore = 0.3 * matchRatio;
      if (hasProteinMatch) wordScore += 0.2;
      if (hasDishTypeMatch) wordScore += 0.1;

      score += wordScore;
    }
  }

  // === INGREDIENT MATCHING ===
  if (recipeIngredients.length > 0) {
    const normalizedRecipeIngredients = recipeIngredients.map(normalizeIngredient);
    const normalizedLibraryIngredients = entry.primaryIngredients.map(normalizeIngredient);

    let ingredientMatches = 0;
    let proteinMatched = false;

    for (const recipeIng of normalizedRecipeIngredients) {
      for (const libIng of normalizedLibraryIngredients) {
        if (recipeIng === libIng || (recipeIng.length >= 4 && libIng.length >= 4 && (recipeIng.includes(libIng) || libIng.includes(recipeIng)))) {
          ingredientMatches++;
          if (PROTEINS.has(recipeIng) || PROTEINS.has(libIng)) {
            proteinMatched = true;
          }
          break;
        }
      }
    }

    if (ingredientMatches > 0) {
      // Score based on how many of the library's key ingredients were matched
      const ingredientScore = ingredientMatches / Math.max(entry.primaryIngredients.length, 3);
      score += 0.3 * Math.min(ingredientScore, 1);

      // Bonus for matching the protein
      if (proteinMatched) {
        score += 0.15;
      }
    }
  }

  return Math.min(score, 1);
}

export interface ImageMatchResult {
  url: string;
  score: number;
  matchedEntry: ImageLibraryEntry;
}

/**
 * Finds the best matching image from the Supabase image library
 *
 * @param recipeName - The name of the recipe
 * @param recipeIngredients - Array of ingredient names from the recipe
 * @param minScore - Minimum score threshold (default 0.5 for quality matches)
 * @returns The matching image URL or null if no good match found
 */
export function findSupabaseImage(
  recipeName: string,
  recipeIngredients: string[] = [],
  minScore: number = 0.5
): ImageMatchResult | null {
  let bestMatch: ImageMatchResult | null = null;

  for (const entry of IMAGE_LIBRARY) {
    const score = calculateMatchScore(recipeName, recipeIngredients, entry);

    if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        url: entry.publicUrl,
        score,
        matchedEntry: entry,
      };
    }
  }

  if (bestMatch) {
    console.log(`[Supabase Image] Found match for "${recipeName}": ${bestMatch.matchedEntry.displayTag} (score: ${bestMatch.score.toFixed(2)})`);
  } else {
    console.log(`[Supabase Image] No match found for "${recipeName}" (min score: ${minScore}) - will use Pixabay fallback`);
  }

  return bestMatch;
}

/**
 * Extracts primary ingredient names from a recipe's ingredient list
 * Used to prepare ingredients for image matching
 */
export function extractPrimaryIngredientNames(
  ingredients: Array<{ name: string; category?: string }>
): string[] {
  // Prioritize protein and main ingredients
  const priorityCategories = ['meat', 'produce', 'dairy'];

  const sorted = [...ingredients].sort((a, b) => {
    const aIndex = priorityCategories.indexOf(a.category || 'other');
    const bIndex = priorityCategories.indexOf(b.category || 'other');
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  // Return up to 8 ingredient names for matching
  return sorted.slice(0, 8).map(ing => ing.name);
}
