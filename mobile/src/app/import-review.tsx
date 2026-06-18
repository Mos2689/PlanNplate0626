import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  X,
  Check,
  Clock,
  Users,
  Flame,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Edit3,
  Bookmark,
  Link as LinkIcon,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { ImportedRecipe } from '@/lib/recipeImport';
import type { Ingredient, Recipe } from '@/lib/store';
import { useMealPlanStore } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { classifyRecipeByContent } from '@/lib/meal-type-validator';
import { validateIngredients } from '@/lib/ingredient-validator';
import { generateRecipeImage } from '@/lib/openai';

const CATEGORY_OPTIONS: Ingredient['category'][] = [
  'produce',
  'dairy',
  'meat',
  'pantry',
  'frozen',
  'bakery',
  'other',
];

export default function ImportReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipe: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const hasRecipeWithSourceUrl = useMealPlanStore((s) => s.hasRecipeWithSourceUrl);

  // Parse the imported recipe from params
  const initialRecipe = useMemo(() => {
    try {
      return JSON.parse(params.recipe ?? '{}') as ImportedRecipe;
    } catch {
      return null;
    }
  }, [params.recipe]);

  // Editable state - use empty defaults if no initial recipe
  const [name, setName] = useState(initialRecipe?.name ?? '');
  const [description, setDescription] = useState(initialRecipe?.description ?? '');
  const [prepTime, setPrepTime] = useState(String(initialRecipe?.prepTime ?? 10));
  const [cookTime, setCookTime] = useState(String(initialRecipe?.cookTime ?? 20));
  const [servings, setServings] = useState(String(initialRecipe?.servings ?? 2));
  const [calories, setCalories] = useState(String(initialRecipe?.calories ?? 0));
  const [ingredients, setIngredients] = useState(
    initialRecipe?.ingredients?.map((ing, idx) => ({
      ...ing,
      id: `ing-${idx}`,
    })) ?? []
  );
  const [instructions, setInstructions] = useState(initialRecipe?.instructions ?? []);
  const [tags, setTags] = useState(initialRecipe?.tags ?? []);
  const sourceUrl = initialRecipe?.sourceUrl;

  // Section expand states
  const [ingredientsExpanded, setIngredientsExpanded] = useState(true);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // Editing states
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [editingInstructionIndex, setEditingInstructionIndex] = useState<number | null>(null);
  const [newTag, setNewTag] = useState('');

  // Compute meal type classification
  const classifiedMealType = useMemo(() => {
    const tempRecipe = {
      name,
      description,
      cookTime: parseInt(cookTime, 10) || 20,
      prepTime: parseInt(prepTime, 10) || 10,
      servings: parseInt(servings, 10) || 2,
      ingredients: ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions,
      calories: parseInt(calories, 10) || undefined,
      tags: [],
    };
    return classifyRecipeByContent(tempRecipe as any);
  }, [name, description, cookTime, prepTime, servings, ingredients, instructions, calories]);

  const handleOpenSourceUrl = useCallback(async () => {
    if (!sourceUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      let url = sourceUrl.trim();

      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }

      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Error', 'Cannot open this link on your device');
        return;
      }

      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', 'Unable to open link');
      console.error('Failed to open URL:', err);
    }
  }, [sourceUrl]);

  // All hooks must be called before any early returns
  const handleSaveRecipe = useCallback(async () => {
    // Normalize URL for comparison (remove query parameters like 'si' for YouTube)
    const normalizeUrl = (url: string): string => {
      try {
        const urlObj = new URL(url);
        // Remove YouTube tracking parameters
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
          // Keep only the video ID parameter (v= for youtube.com, nothing for youtu.be path)
          const videoId = urlObj.searchParams.get('v');
          if (videoId) {
            return `https://youtube.com/watch?v=${videoId}`;
          }
          // For short URLs like youtu.be/xyz, just use the pathname
          return `https://youtu.be${urlObj.pathname}`;
        }
        // For other URLs, return as-is
        return url;
      } catch {
        return url;
      }
    };

    const normalizedSourceUrl = sourceUrl ? normalizeUrl(sourceUrl) : null;

    // Debug: Log source URL and existing recipes
    console.log('[IMPORT-REVIEW] Source URL (original):', sourceUrl);
    console.log('[IMPORT-REVIEW] Source URL (normalized):', normalizedSourceUrl);
    if (normalizedSourceUrl) {
      console.log('[IMPORT-REVIEW] Checking for duplicate:', hasRecipeWithSourceUrl(normalizedSourceUrl));
    }

    // Check if recipe with same source URL already exists
    if (normalizedSourceUrl && hasRecipeWithSourceUrl(normalizedSourceUrl)) {
      Alert.alert(
        'Recipe Already Imported',
        'This recipe has already been imported from this URL.',
        [{ text: 'OK' }]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Validate and normalize ingredients using strict unit type rules
    const validatedIngredients = validateIngredients(ingredients);

    // First, classify recipe by content to determine meal type
    const tempRecipe = {
      name,
      description,
      cookTime: parseInt(cookTime, 10) || 20,
      prepTime: parseInt(prepTime, 10) || 10,
      servings: parseInt(servings, 10) || 2,
      ingredients: validatedIngredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions,
      calories: parseInt(calories, 10) || undefined,
      tags: [],
    };

    const mealType = classifyRecipeByContent(tempRecipe as any);

    // Add meal type to tags if not already present
    const updatedTags = [...tags];
    if (!updatedTags.includes(mealType)) {
      updatedTags.push(mealType);
    }

    // Fetch a relevant image for the recipe
    let imageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';
    try {
      const ingredientsForImage = validatedIngredients.map(ing => ({ name: ing.name, category: ing.category }));
      imageUrl = await generateRecipeImage(name, description, ingredientsForImage);
    } catch (error) {
      console.log('[IMPORT-REVIEW] Failed to fetch recipe image, using fallback:', error);
    }

    const newRecipe: Recipe = {
      id: '', // Will be generated by store
      name,
      description,
      imageUrl,
      prepTime: parseInt(prepTime, 10) || 10,
      cookTime: parseInt(cookTime, 10) || 20,
      servings: parseInt(servings, 10) || 2,
      ingredients: validatedIngredients.map((ing, idx) => ({
        id: `${Date.now()}-${idx}`,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions,
      tags: updatedTags,
      calories: parseInt(calories, 10) || undefined,
      isAIGenerated: false,
      isImported: true,
      sourceUrl: normalizedSourceUrl || undefined, // Save the normalized URL if available
      isSaved: false,
      createdAt: new Date().toISOString(),
    };

    console.log('[IMPORT-REVIEW] Final recipe object:', {
      name: newRecipe.name,
      isImported: newRecipe.isImported,
      sourceUrl: newRecipe.sourceUrl,
      sourceUrlType: typeof newRecipe.sourceUrl,
      sourceUrlLength: newRecipe.sourceUrl?.length,
    });

    addRecipe(newRecipe);

    router.dismissAll();
    router.replace('/(tabs)/recipes');
  }, [name, description, prepTime, cookTime, servings, calories, ingredients, instructions, tags, sourceUrl, addRecipe, router, hasRecipeWithSourceUrl]);

  const handleUpdateIngredient = useCallback(
    (index: number, field: string, value: string) => {
      setIngredients((prev) =>
        prev.map((ing, idx) =>
          idx === index ? { ...ing, [field]: value } : ing
        )
      );
    },
    []
  );

  const handleRemoveIngredient = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleAddIngredient = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => {
      const newIngredients = [
        ...prev,
        {
          id: `ing-${Date.now()}`,
          name: '',
          quantity: '1',
          unit: 'unit',
          category: 'other' as Ingredient['category'],
        },
      ];
      setEditingIngredientIndex(newIngredients.length - 1);
      return newIngredients;
    });
  }, []);

  const handleUpdateInstruction = useCallback(
    (index: number, value: string) => {
      setInstructions((prev) =>
        prev.map((inst, idx) => (idx === index ? value : inst))
      );
    },
    []
  );

  const handleRemoveInstruction = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInstructions((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleAddInstruction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInstructions((prev) => {
      const newInstructions = [...prev, ''];
      setEditingInstructionIndex(newInstructions.length - 1);
      return newInstructions;
    });
  }, []);

  const handleAddTag = useCallback(() => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTags((prev) => [...prev, newTag.trim()]);
      setNewTag('');
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // Early return AFTER all hooks
  if (!initialRecipe) {
    return (
      <View className={cn("flex-1 items-center justify-center", isDark ? "bg-charcoal-900" : "bg-cream-50")}>
        <Text className={cn("text-base", isDark ? "text-white" : "text-charcoal-900")}>
          No recipe data found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className={cn(
            "mt-4 px-6 py-3 rounded-xl",
            isDark ? "bg-charcoal-800" : "bg-cream-100"
          )}
        >
          <Text className={cn("text-sm font-medium", isDark ? "text-white" : "text-charcoal-900")}>
            Go Back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className={cn("flex-1", isDark ? "bg-charcoal-900" : "bg-cream-50")}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.springify()}
          className="flex-row items-center justify-between px-5 py-4"
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className={cn(
              "w-10 h-10 rounded-full items-center justify-center",
              isDark ? "bg-charcoal-800/50" : "bg-white/80"
            )}
          >
            <X size={20} color={isDark ? '#fff' : '#262626'} />
          </Pressable>
          <View className="flex-row items-center">
            <Edit3 size={20} color={isDark ? '#f5b8a0' : '#e46d46'} />
            <Text className={cn(
              "text-lg font-bold ml-2",
              isDark ? "text-white" : "text-charcoal-900"
            )}>
              Review Recipe
            </Text>
          </View>
          <View className="w-10" />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Source URL */}
            {sourceUrl && (
              <Animated.View
                entering={FadeInDown.delay(50).springify()}
                className="px-5 mb-4"
              >
                <Pressable
                  onPress={handleOpenSourceUrl}
                  className={cn(
                    "flex-row items-center px-4 py-3 rounded-xl",
                    isDark ? "bg-charcoal-800/50 active:bg-charcoal-700" : "bg-cream-100 active:bg-cream-200"
                  )}
                >
                  <LinkIcon size={16} color={isDark ? '#888888' : '#6d6d6d'} />
                  <Text
                    className={cn(
                      "flex-1 text-xs ml-2",
                      isDark ? "text-charcoal-400" : "text-charcoal-500"
                    )}
                    numberOfLines={1}
                  >
                    {sourceUrl}
                  </Text>
                  <Text className={cn(
                    "text-xs ml-2",
                    isDark ? "text-charcoal-500" : "text-charcoal-400"
                  )}>
                    Tap to verify
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Recipe Name */}
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              className="px-5 mb-4"
            >
              <Text className={cn(
                "text-sm font-medium mb-2",
                isDark ? "text-charcoal-400" : "text-charcoal-500"
              )}>
                Recipe Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter recipe name"
                placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                className={cn(
                  "text-xl font-bold px-4 py-3 rounded-2xl",
                  isDark ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-900"
                )}
              />
            </Animated.View>

            {/* Description */}
            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              className="px-5 mb-4"
            >
              <Text className={cn(
                "text-sm font-medium mb-2",
                isDark ? "text-charcoal-400" : "text-charcoal-500"
              )}>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Enter description"
                placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className={cn(
                  "text-base px-4 py-3 rounded-2xl",
                  isDark ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-900"
                )}
                style={{ minHeight: 80 }}
              />
            </Animated.View>

            {/* Quick Stats */}
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              className="px-5 mb-6"
            >
              <View className="flex-row">
                {/* Prep Time */}
                <View className={cn(
                  "flex-1 p-3 rounded-2xl mr-2",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  <View className="flex-row items-center mb-2">
                    <Clock size={14} color={isDark ? '#888888' : '#6d6d6d'} />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-400" : "text-charcoal-500"
                    )}>
                      Prep
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TextInput
                      value={prepTime}
                      onChangeText={setPrepTime}
                      keyboardType="number-pad"
                      className={cn(
                        "text-lg font-bold",
                        isDark ? "text-white" : "text-charcoal-900"
                      )}
                      style={{ minWidth: 40 }}
                    />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-500" : "text-charcoal-400"
                    )}>
                      min
                    </Text>
                  </View>
                </View>

                {/* Cook Time */}
                <View className={cn(
                  "flex-1 p-3 rounded-2xl mr-2",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  <View className="flex-row items-center mb-2">
                    <Flame size={14} color={isDark ? '#888888' : '#6d6d6d'} />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-400" : "text-charcoal-500"
                    )}>
                      Cook
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TextInput
                      value={cookTime}
                      onChangeText={setCookTime}
                      keyboardType="number-pad"
                      className={cn(
                        "text-lg font-bold",
                        isDark ? "text-white" : "text-charcoal-900"
                      )}
                      style={{ minWidth: 40 }}
                    />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-500" : "text-charcoal-400"
                    )}>
                      min
                    </Text>
                  </View>
                </View>

                {/* Servings */}
                <View className={cn(
                  "flex-1 p-3 rounded-2xl mr-2",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  <View className="flex-row items-center mb-2">
                    <Users size={14} color={isDark ? '#888888' : '#6d6d6d'} />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-400" : "text-charcoal-500"
                    )}>
                      Serves
                    </Text>
                  </View>
                  <TextInput
                    value={servings}
                    onChangeText={setServings}
                    keyboardType="number-pad"
                    className={cn(
                      "text-lg font-bold",
                      isDark ? "text-white" : "text-charcoal-900"
                    )}
                    style={{ minWidth: 40 }}
                  />
                </View>

                {/* Calories */}
                <View className={cn(
                  "flex-1 p-3 rounded-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  <View className="flex-row items-center mb-2">
                    <Flame size={14} color={isDark ? '#f5b8a0' : '#e46d46'} />
                    <Text className={cn(
                      "text-xs ml-1",
                      isDark ? "text-charcoal-400" : "text-charcoal-500"
                    )}>
                      Cal
                    </Text>
                  </View>
                  <TextInput
                    value={calories}
                    onChangeText={setCalories}
                    keyboardType="number-pad"
                    className={cn(
                      "text-lg font-bold",
                      isDark ? "text-white" : "text-charcoal-900"
                    )}
                    style={{ minWidth: 40 }}
                  />
                </View>
              </View>
            </Animated.View>

            {/* Ingredients Section */}
            <Animated.View
              entering={FadeInDown.delay(250).springify()}
              className="px-5 mb-4"
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIngredientsExpanded(!ingredientsExpanded);
                }}
                className={cn(
                  "flex-row items-center justify-between p-4 rounded-t-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}
              >
                <View className="flex-row items-center">
                  <Text className={cn(
                    "text-base font-semibold",
                    isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    Ingredients
                  </Text>
                  <View className={cn(
                    "ml-2 px-2 py-0.5 rounded-full",
                    isDark ? "bg-charcoal-700" : "bg-cream-100"
                  )}>
                    <Text className={cn(
                      "text-xs font-medium",
                      isDark ? "text-charcoal-300" : "text-charcoal-600"
                    )}>
                      {ingredients.length}
                    </Text>
                  </View>
                </View>
                {ingredientsExpanded ? (
                  <ChevronUp size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                ) : (
                  <ChevronDown size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                )}
              </Pressable>

              {ingredientsExpanded && (
                <View className={cn(
                  "rounded-b-2xl overflow-hidden",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  {ingredients.map((ing, index) => (
                    <Animated.View
                      key={ing.id}
                      entering={FadeInRight.delay(index * 30).springify()}
                      className={cn(
                        "flex-row items-center px-4 py-3",
                        index > 0 && (isDark ? "border-t border-charcoal-700" : "border-t border-cream-100")
                      )}
                    >
                      {editingIngredientIndex === index ? (
                        <View className="flex-1">
                          <View className="flex-row mb-2">
                            <TextInput
                              value={ing.quantity}
                              onChangeText={(v) => handleUpdateIngredient(index, 'quantity', v)}
                              placeholder="Qty"
                              placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                              className={cn(
                                "w-16 px-2 py-1 rounded mr-2 text-sm",
                                isDark ? "bg-charcoal-700 text-white" : "bg-cream-50 text-charcoal-900"
                              )}
                            />
                            <TextInput
                              value={ing.unit}
                              onChangeText={(v) => handleUpdateIngredient(index, 'unit', v)}
                              placeholder="Unit"
                              placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                              className={cn(
                                "w-20 px-2 py-1 rounded mr-2 text-sm",
                                isDark ? "bg-charcoal-700 text-white" : "bg-cream-50 text-charcoal-900"
                              )}
                            />
                            <TextInput
                              value={ing.name}
                              onChangeText={(v) => handleUpdateIngredient(index, 'name', v)}
                              placeholder="Ingredient name"
                              placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                              className={cn(
                                "flex-1 px-2 py-1 rounded text-sm",
                                isDark ? "bg-charcoal-700 text-white" : "bg-cream-50 text-charcoal-900"
                              )}
                            />
                          </View>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                            <View className="flex-row">
                              {CATEGORY_OPTIONS.map((cat) => (
                                <Pressable
                                  key={cat}
                                  onPress={() => {
                                    handleUpdateIngredient(index, 'category', cat);
                                    setEditingIngredientIndex(null);
                                  }}
                                  className={cn(
                                    "px-3 py-1 rounded-full mr-2",
                                    ing.category === cat
                                      ? isDark ? "bg-sage-600" : "bg-sage-500"
                                      : isDark ? "bg-charcoal-700" : "bg-cream-100"
                                  )}
                                >
                                  <Text className={cn(
                                    "text-xs capitalize",
                                    ing.category === cat
                                      ? "text-white"
                                      : isDark ? "text-charcoal-300" : "text-charcoal-600"
                                  )}>
                                    {cat}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      ) : (
                        <>
                          <View className="flex-1">
                            <Text className={cn(
                              "text-sm",
                              isDark ? "text-white" : "text-charcoal-900"
                            )}>
                              {ing.quantity} {ing.unit} {ing.name}
                            </Text>
                            <Text className={cn(
                              "text-xs capitalize mt-0.5",
                              isDark ? "text-charcoal-500" : "text-charcoal-400"
                            )}>
                              {ing.category}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => setEditingIngredientIndex(index)}
                            className="p-2"
                          >
                            <Edit3 size={16} color={isDark ? '#888888' : '#6d6d6d'} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRemoveIngredient(index)}
                            className="p-2"
                          >
                            <Trash2 size={16} color="#dc2626" />
                          </Pressable>
                        </>
                      )}
                    </Animated.View>
                  ))}

                  <Pressable
                    onPress={handleAddIngredient}
                    className={cn(
                      "flex-row items-center justify-center py-3",
                      isDark ? "border-t border-charcoal-700" : "border-t border-cream-100"
                    )}
                  >
                    <Plus size={16} color={isDark ? '#94a094' : '#709070'} />
                    <Text className={cn(
                      "text-sm font-medium ml-2",
                      isDark ? "text-sage-400" : "text-sage-600"
                    )}>
                      Add Ingredient
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>

            {/* Instructions Section */}
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              className="px-5 mb-4"
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setInstructionsExpanded(!instructionsExpanded);
                }}
                className={cn(
                  "flex-row items-center justify-between p-4 rounded-t-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}
              >
                <View className="flex-row items-center">
                  <Text className={cn(
                    "text-base font-semibold",
                    isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    Instructions
                  </Text>
                  <View className={cn(
                    "ml-2 px-2 py-0.5 rounded-full",
                    isDark ? "bg-charcoal-700" : "bg-cream-100"
                  )}>
                    <Text className={cn(
                      "text-xs font-medium",
                      isDark ? "text-charcoal-300" : "text-charcoal-600"
                    )}>
                      {instructions.length} steps
                    </Text>
                  </View>
                </View>
                {instructionsExpanded ? (
                  <ChevronUp size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                ) : (
                  <ChevronDown size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                )}
              </Pressable>

              {instructionsExpanded && (
                <View className={cn(
                  "rounded-b-2xl overflow-hidden",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  {instructions.map((inst, index) => (
                    <Animated.View
                      key={`inst-${index}`}
                      entering={FadeInRight.delay(index * 30).springify()}
                      className={cn(
                        "flex-row px-4 py-3",
                        index > 0 && (isDark ? "border-t border-charcoal-700" : "border-t border-cream-100")
                      )}
                    >
                      <View className={cn(
                        "w-6 h-6 rounded-full items-center justify-center mr-3 mt-1",
                        isDark ? "bg-sage-600" : "bg-sage-500"
                      )}>
                        <Text className="text-white text-xs font-bold">
                          {index + 1}
                        </Text>
                      </View>
                      {editingInstructionIndex === index ? (
                        <TextInput
                          value={inst}
                          onChangeText={(v) => handleUpdateInstruction(index, v)}
                          onBlur={() => setEditingInstructionIndex(null)}
                          multiline
                          autoFocus
                          className={cn(
                            "flex-1 text-sm px-2 py-1 rounded",
                            isDark ? "bg-charcoal-700 text-white" : "bg-cream-50 text-charcoal-900"
                          )}
                          style={{ minHeight: 60 }}
                        />
                      ) : (
                        <>
                          <Text className={cn(
                            "flex-1 text-sm leading-5",
                            isDark ? "text-charcoal-200" : "text-charcoal-700"
                          )}>
                            {inst || '(Empty step)'}
                          </Text>
                          <Pressable
                            onPress={() => setEditingInstructionIndex(index)}
                            className="p-2"
                          >
                            <Edit3 size={16} color={isDark ? '#888888' : '#6d6d6d'} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRemoveInstruction(index)}
                            className="p-2"
                          >
                            <Trash2 size={16} color="#dc2626" />
                          </Pressable>
                        </>
                      )}
                    </Animated.View>
                  ))}

                  <Pressable
                    onPress={handleAddInstruction}
                    className={cn(
                      "flex-row items-center justify-center py-3",
                      isDark ? "border-t border-charcoal-700" : "border-t border-cream-100"
                    )}
                  >
                    <Plus size={16} color={isDark ? '#94a094' : '#709070'} />
                    <Text className={cn(
                      "text-sm font-medium ml-2",
                      isDark ? "text-sage-400" : "text-sage-600"
                    )}>
                      Add Step
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>

            {/* Tags Section */}
            <Animated.View
              entering={FadeInDown.delay(350).springify()}
              className="px-5 mb-4"
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTagsExpanded(!tagsExpanded);
                }}
                className={cn(
                  "flex-row items-center justify-between p-4",
                  tagsExpanded ? "rounded-t-2xl" : "rounded-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}
              >
                <View className="flex-row items-center">
                  <Text className={cn(
                    "text-base font-semibold",
                    isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    Tags
                  </Text>
                  <View className={cn(
                    "ml-2 px-2 py-0.5 rounded-full",
                    isDark ? "bg-charcoal-700" : "bg-cream-100"
                  )}>
                    <Text className={cn(
                      "text-xs font-medium",
                      isDark ? "text-charcoal-300" : "text-charcoal-600"
                    )}>
                      {tags.length}
                    </Text>
                  </View>
                </View>
                {tagsExpanded ? (
                  <ChevronUp size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                ) : (
                  <ChevronDown size={20} color={isDark ? '#888888' : '#6d6d6d'} />
                )}
              </Pressable>

              {tagsExpanded && (
                <View className={cn(
                  "px-4 pb-4 rounded-b-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}>
                  <View className="flex-row flex-wrap mb-3">
                    {/* Meal Type Tag - Auto-classified, non-removable */}
                    <View className={cn(
                      "flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2",
                      isDark ? "bg-sage-700" : "bg-sage-200"
                    )}>
                      <Text className={cn(
                        "text-xs font-semibold capitalize",
                        isDark ? "text-sage-100" : "text-sage-800"
                      )}>
                        {classifiedMealType}
                      </Text>
                      <Text className={cn(
                        "text-xs ml-1",
                        isDark ? "text-sage-300" : "text-sage-700"
                      )}>
                        ✓
                      </Text>
                    </View>

                    {/* User-added tags */}
                    {tags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => handleRemoveTag(tag)}
                        className={cn(
                          "flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2",
                          isDark ? "bg-charcoal-700" : "bg-cream-100"
                        )}
                      >
                        <Text className={cn(
                          "text-xs",
                          isDark ? "text-charcoal-300" : "text-charcoal-600"
                        )}>
                          {tag}
                        </Text>
                        <X size={12} color={isDark ? '#888888' : '#6d6d6d'} className="ml-1" />
                      </Pressable>
                    ))}
                  </View>
                  <View className="flex-row items-center">
                    <TextInput
                      value={newTag}
                      onChangeText={setNewTag}
                      placeholder="Add a tag..."
                      placeholderTextColor={isDark ? '#6d6d6d' : '#9ca3af'}
                      onSubmitEditing={handleAddTag}
                      returnKeyType="done"
                      className={cn(
                        "flex-1 text-sm px-3 py-2 rounded-xl mr-2",
                        isDark ? "bg-charcoal-700 text-white" : "bg-cream-50 text-charcoal-900"
                      )}
                    />
                    <Pressable
                      onPress={handleAddTag}
                      disabled={!newTag.trim()}
                      className={cn(
                        "p-2 rounded-full",
                        newTag.trim()
                          ? isDark ? "bg-sage-600" : "bg-sage-500"
                          : isDark ? "bg-charcoal-700" : "bg-cream-100"
                      )}
                    >
                      <Plus size={18} color={newTag.trim() ? '#fff' : isDark ? '#6d6d6d' : '#9ca3af'} />
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Save Button */}
        <View className={cn(
          "absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4",
          isDark ? "bg-charcoal-900" : "bg-cream-50"
        )}>
          <LinearGradient
            colors={isDark ? ['transparent', '#262626'] : ['transparent', '#fefdfb']}
            style={{
              position: 'absolute',
              top: -40,
              left: 0,
              right: 0,
              height: 40,
            }}
          />
          <Pressable
            onPress={handleSaveRecipe}
            disabled={!name.trim()}
            className={cn(
              "flex-row items-center justify-center py-4 rounded-2xl",
              name.trim()
                ? isDark ? "bg-sage-600" : "bg-sage-500"
                : isDark ? "bg-charcoal-800" : "bg-cream-200"
            )}
          >
            <Bookmark
              size={20}
              color={name.trim() ? '#fff' : isDark ? '#6d6d6d' : '#888888'}
            />
            <Text className={cn(
              "text-base font-semibold ml-2",
              name.trim()
                ? "text-white"
                : isDark ? "text-charcoal-600" : "text-charcoal-400"
            )}>
              Save to My Recipes
            </Text>
            <Check
              size={20}
              color={name.trim() ? '#fff' : isDark ? '#6d6d6d' : '#888888'}
              className="ml-1"
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
