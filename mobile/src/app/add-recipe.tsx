import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Keyboard, TouchableWithoutFeedback, Image, Animated as RNAnimated, Easing as RNEasing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  X,
  Plus,
  Clock,
  Users,
  Flame,
  ChefHat,
  Trash2,
  Mic,
  MicOff,
  Sparkles,
  Upload,
  FileText,
  Camera,
  Image as ImageIcon,
  // Premium icon swaps for the redesign
  CirclePlus,
  UsersRound,
  FileUp,
  MicVocal,
  ScrollText,
  Tag,
  Hash,
  Check,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch } from 'expo/fetch';
import { useMealPlanStore, type Recipe, type Ingredient } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { isOpenAIConfigured, generateRecipeImage } from '@/lib/openai';
import { supabase } from '@/lib/supabase';
import { classifyRecipeByContent } from '@/lib/meal-type-validator';
import { validateIngredients } from '@/lib/ingredient-validator';
import { useRecipeFeatureGate } from '@/hooks/useRecipeFeatureGate';
import { apiCall, apiFormCall } from '@/lib/api-router';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';

interface IngredientInput {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: Ingredient['category'];
}

interface ParsedRecipe {
  name: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  ingredients: Array<{ name: string; quantity: string; unit: string; category: string }>;
  instructions: string[];
  tags: string[];
}

async function parseRecipeFromImage(imageUri: string): Promise<ParsedRecipe> {
  // Read the image as base64
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Determine mime type from uri
  const isJpeg = imageUri.toLowerCase().includes('.jpg') || imageUri.toLowerCase().includes('.jpeg');
  const mimeType = isJpeg ? 'image/jpeg' : 'image/png';

  console.log('[AddRecipe] Parsing recipe from image via Supabase Edge Function...');

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a recipe parser. Extract recipe information from images (can be a photo of a recipe card, screenshot of a recipe, photo of food with visible recipe text, etc.) and return a JSON object with this exact structure:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "calories": 400,
  "ingredients": [
    {"name": "ingredient", "quantity": "1", "unit": "cup", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1", "Step 2"],
  "tags": ["tag1", "tag2"]
}
Only output valid JSON, no markdown or explanations. If information is missing, make reasonable estimates based on what you can see.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the recipe information from this image and return it as structured JSON.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.3,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  const content = result.data?.choices?.[0]?.message?.content || '';

  // Clean and parse JSON
  let cleanedText = content.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  console.log('[AddRecipe] Recipe parsed from image successfully');
  return JSON.parse(cleanedText.trim());
}

// Parse recipe from multiple images (up to 5)
async function parseRecipeFromMultipleImages(imageUris: string[]): Promise<ParsedRecipe> {
  // Read all images as base64
  const imageContents = await Promise.all(
    imageUris.map(async (uri) => {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const isJpeg = uri.toLowerCase().includes('.jpg') || uri.toLowerCase().includes('.jpeg');
      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      return { base64, mimeType };
    })
  );

  console.log(`[AddRecipe] Parsing recipe from ${imageUris.length} images via Supabase Edge Function...`);

  // Build the content array with all images
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: `You are looking at ${imageUris.length} image(s) that may contain recipe information.

FIRST, determine if these images appear to be from the SAME recipe or related to the same dish.
- Look for consistent recipe names, similar ingredients lists, matching cooking instructions
- Screenshots of the same recipe page (scrolled), photos of the same recipe card, etc. are RELATED
- Completely different recipes, unrelated food photos, or random images are NOT RELATED

If the images are NOT clearly related to the same recipe, respond with ONLY this JSON:
{"error": "unrelated_images", "message": "These images don't appear to be from the same recipe. Please upload images from a single recipe."}

If the images ARE related to the same recipe, extract the recipe information and return this JSON:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "calories": 400,
  "ingredients": [
    {"name": "ingredient", "quantity": "1", "unit": "cup", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1", "Step 2"],
  "tags": ["tag1", "tag2"]
}

Combine information from all images to create a complete recipe. Only output valid JSON, no markdown.`,
    },
  ];

  // Add all images to the content
  imageContents.forEach(({ base64, mimeType }) => {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
      },
    });
  });

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a recipe parser that extracts recipe information from images. You can analyze multiple images and combine them into a single complete recipe if they are related.',
      },
      { role: 'user', content: userContent },
    ],
    max_tokens: 2500,
    temperature: 0.3,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  const content = result.data?.choices?.[0]?.message?.content || '';

  // Clean and parse JSON
  let cleanedText = content.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  const parsed = JSON.parse(cleanedText.trim());

  // Check if AI detected unrelated images
  if (parsed.error === 'unrelated_images') {
    throw new Error(parsed.message || 'Images do not appear to be from the same recipe');
  }

  console.log('[AddRecipe] Recipe parsed from multiple images successfully');
  return parsed;
}

async function transcribeAudio(audioUri: string): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(audioUri);
  if (!fileInfo.exists) {
    throw new Error('Audio file not found');
  }

  console.log('[AddRecipe] Transcribing audio via Supabase Edge Function...');
  console.log('[AddRecipe] Audio file URI:', audioUri);
  console.log('[AddRecipe] Audio file size:', (fileInfo as any).size || 'unknown');

  try {
    // Create form data with the audio file
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('model', 'whisper-1');

    // Use apiFormCall for the request
    const result = await apiFormCall<{ text: string }>('openai-transcribe', formData);

    console.log('[AddRecipe] Transcription result:', JSON.stringify(result).substring(0, 300));

    if (result.error) {
      console.error('[AddRecipe] Transcription API error:', result.error);
      throw new Error(result.error);
    }

    console.log('[AddRecipe] Audio transcribed successfully');
    return result.data?.text ?? '';
  } catch (error: any) {
    console.error('[AddRecipe] Transcription error:', error);
    console.error('[AddRecipe] Error message:', error?.message);
    console.error('[AddRecipe] Error stack:', error?.stack?.substring(0, 300));
    throw error;
  }
}

async function parseRecipeFromText(text: string): Promise<ParsedRecipe> {
  console.log('[AddRecipe] Parsing recipe from text via Supabase Edge Function...');

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a recipe parser. Extract recipe information from spoken text and return a JSON object with this exact structure:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "calories": 400,
  "ingredients": [
    {"name": "ingredient", "quantity": "1", "unit": "cup", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1", "Step 2"],
  "tags": ["tag1", "tag2"]
}
Only output valid JSON, no markdown or explanations. If information is missing, make reasonable estimates.`,
      },
      {
        role: 'user',
        content: `Parse this spoken recipe into structured JSON: "${text}"`,
      },
    ],
    temperature: 0.3,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  const responseContent = result.data?.choices?.[0]?.message?.content || '';

  // Clean and parse JSON
  let cleanedText = responseContent.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  console.log('[AddRecipe] Recipe parsed from text successfully');
  return JSON.parse(cleanedText.trim());
}

export default function AddRecipeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);
  // One free use, then the paywall (independent per-feature gate).
  const recipeGate = useRecipeFeatureGate('add', 'generic');

  const addRecipe = useMealPlanStore((s) => s.addRecipe);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prepTime, setPrepTime] = useState('15');
  const [cookTime, setCookTime] = useState('30');
  const [servings, setServings] = useState('4');
  const [calories, setCalories] = useState('');
  const [tags, setTags] = useState('');
  const [ingredients, setIngredients] = useState<IngredientInput[]>([
    { id: '1', name: '', quantity: '', unit: '', category: 'produce' },
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [isUploadProcessing, setIsUploadProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]); // Multiple images (up to 5)
  const [wasAutoFilled, setWasAutoFilled] = useState(false); // Track if form was auto-filled via voice/upload

  // Compute meal type classification
  const classifiedMealType = useMemo(() => {
    const tempRecipe = {
      name,
      description,
      cookTime: parseInt(cookTime) || 30,
      prepTime: parseInt(prepTime) || 15,
      servings: parseInt(servings) || 4,
      ingredients: ingredients
        .filter((ing) => ing.name.trim())
        .map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
        })),
      instructions: instructions.filter((inst) => inst.trim()),
      calories: calories ? parseInt(calories) : undefined,
      tags: [],
    };
    return classifyRecipeByContent(tempRecipe as any);
  }, [name, description, cookTime, prepTime, servings, ingredients, instructions, calories]);

  const recordingRef = useRef<Audio.Recording | null>(null);

  // Animation for recording indicator
  const pulseScale = useSharedValue(1);
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const startRecording = useCallback(async () => {
    try {
      setVoiceError(null);

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setVoiceError('Microphone permission is required');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(true);
      setShowVoiceModal(true);

      // Start pulse animation
      pulseScale.value = withRepeat(
        withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
    } catch (error) {
      console.error('Failed to start recording:', error);
      setVoiceError('Failed to start recording');
      setIsRecording(false);
    }
  }, [pulseScale]);

  const stopRecording = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(false);
      pulseScale.value = 1;

      const recording = recordingRef.current;
      if (!recording) {
        setVoiceError('No recording found');
        return;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setVoiceError('No recording found');
        return;
      }

      setIsProcessing(true);

      // Transcribe audio
      const transcription = await transcribeAudio(uri);
      setTranscribedText(transcription);

      // Parse recipe from transcription
      const parsedRecipe = await parseRecipeFromText(transcription);

      // Fill in the form with parsed data
      setName(parsedRecipe.name || '');
      setDescription(parsedRecipe.description || '');
      setPrepTime(parsedRecipe.prepTime?.toString() || '15');
      setCookTime(parsedRecipe.cookTime?.toString() || '30');
      setServings(parsedRecipe.servings?.toString() || '4');
      setCalories(parsedRecipe.calories?.toString() || '');
      setTags(parsedRecipe.tags?.join(', ') || '');

      if (parsedRecipe.ingredients && parsedRecipe.ingredients.length > 0) {
        setIngredients(
          parsedRecipe.ingredients.map((ing, index) => ({
            id: `voice-${index}`,
            name: ing.name || '',
            quantity: ing.quantity || '',
            unit: ing.unit || '',
            category: (ing.category as Ingredient['category']) || 'produce',
          }))
        );
      }

      if (parsedRecipe.instructions && parsedRecipe.instructions.length > 0) {
        setInstructions(parsedRecipe.instructions);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowVoiceModal(false);
    } catch (error) {
      console.error('Failed to process recording:', error);
      setVoiceError('Failed to process your voice. Please try again or type manually.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  }, [pulseScale]);

  const cancelRecording = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (recording) {
        await recording.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      setIsRecording(false);
      setIsProcessing(false);
      setShowVoiceModal(false);
      setTranscribedText('');
      setVoiceError(null);
      pulseScale.value = 1;
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  }, [pulseScale]);

  // Helper to fill form with parsed recipe data
  const fillFormWithRecipe = useCallback((parsedRecipe: ParsedRecipe) => {
    setName(parsedRecipe.name || '');
    setDescription(parsedRecipe.description || '');
    setPrepTime(parsedRecipe.prepTime?.toString() || '15');
    setCookTime(parsedRecipe.cookTime?.toString() || '30');
    setServings(parsedRecipe.servings?.toString() || '4');
    setCalories(parsedRecipe.calories?.toString() || '');
    setTags(parsedRecipe.tags?.join(', ') || '');
    setWasAutoFilled(true); // Mark as auto-filled via voice/upload

    if (parsedRecipe.ingredients && parsedRecipe.ingredients.length > 0) {
      setIngredients(
        parsedRecipe.ingredients.map((ing, index) => ({
          id: `upload-${index}`,
          name: ing.name || '',
          quantity: ing.quantity || '',
          unit: ing.unit || '',
          category: (ing.category as Ingredient['category']) || 'produce',
        }))
      );
    }

    if (parsedRecipe.instructions && parsedRecipe.instructions.length > 0) {
      setInstructions(parsedRecipe.instructions);
    }
  }, []);

  // Handle text upload processing
  const handleProcessText = useCallback(async () => {
    if (!uploadText.trim()) {
      setUploadError('Please paste some recipe text');
      return;
    }

    try {
      setUploadError(null);
      setIsUploadProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const parsedRecipe = await parseRecipeFromText(uploadText);
      fillFormWithRecipe(parsedRecipe);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowUploadModal(false);
      setUploadText('');
    } catch (error) {
      console.error('Failed to process text:', error);
      setUploadError('Failed to parse recipe from text. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploadProcessing(false);
    }
  }, [uploadText, fillFormWithRecipe]);

  // Handle image upload (add to collection, up to 5)
  const handleImageUpload = useCallback(async () => {
    try {
      setUploadError(null);

      if (uploadedImages.length >= 5) {
        setUploadError('Maximum 5 images allowed');
        return;
      }

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setUploadError('Photo library permission is required');
        return;
      }

      const remainingSlots = 5 - uploadedImages.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newImages = result.assets.map(asset => asset.uri);
      setUploadedImages(prev => [...prev, ...newImages].slice(0, 5));
    } catch (error) {
      console.error('Failed to select images:', error);
      setUploadError('Failed to select images. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [uploadedImages.length]);

  // Handle camera capture (add to collection)
  const handleCameraCapture = useCallback(async () => {
    try {
      setUploadError(null);

      if (uploadedImages.length >= 5) {
        setUploadError('Maximum 5 images allowed');
        return;
      }

      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        setUploadError('Camera permission is required');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setUploadedImages(prev => [...prev, result.assets[0].uri].slice(0, 5));
    } catch (error) {
      console.error('Failed to capture image:', error);
      setUploadError('Failed to capture image. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [uploadedImages.length]);

  // Remove an image from collection
  const handleRemoveImage = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Process uploaded images
  const handleProcessImages = useCallback(async () => {
    if (uploadedImages.length === 0) return;

    try {
      setUploadError(null);
      setIsUploadProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const parsedRecipe = uploadedImages.length === 1
        ? await parseRecipeFromImage(uploadedImages[0])
        : await parseRecipeFromMultipleImages(uploadedImages);

      fillFormWithRecipe(parsedRecipe);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowUploadModal(false);
      setUploadText('');
      setUploadedImages([]);
    } catch (error: any) {
      console.error('Failed to process images:', error);
      setUploadError(error.message || 'Failed to parse recipe from images. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploadProcessing(false);
    }
  }, [uploadedImages, fillFormWithRecipe]);

  const cancelUpload = useCallback(() => {
    setShowUploadModal(false);
    setUploadText('');
    setUploadError(null);
    setIsUploadProcessing(false);
    setUploadedImages([]);
  }, []);

  const addIngredient = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => [
      ...prev,
      { id: Date.now().toString(), name: '', quantity: '', unit: '', category: 'produce' },
    ]);
  }, []);

  const removeIngredient = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  }, []);

  const updateIngredient = useCallback((id: string, field: keyof IngredientInput, value: string) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing))
    );
  }, []);

  const addInstruction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInstructions((prev) => [...prev, '']);
  }, []);

  const removeInstruction = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInstructions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateInstruction = useCallback((index: number, value: string) => {
    setInstructions((prev) => prev.map((inst, i) => (i === index ? value : inst)));
  }, []);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(true);

    // Validate and normalize ingredients using strict unit type rules
    const rawIngredients = ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => ({
        name: ing.name.trim(),
        quantity: ing.quantity.trim() || '1',
        unit: ing.unit.trim() || 'piece',
        category: ing.category as 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
      }));

    const validatedIngredients = validateIngredients(rawIngredients);

    const validIngredients = validatedIngredients.map((ing, index) => ({
      id: `ing-${index}`,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    }));

    const validInstructions = instructions.filter((inst) => inst.trim());

    const tagList = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    // First, classify recipe by content to determine meal type
    const tempRecipe = {
      name: name.trim(),
      description: description.trim() || `A delicious ${name.trim()} recipe`,
      cookTime: parseInt(cookTime) || 30,
      prepTime: parseInt(prepTime) || 15,
      servings: parseInt(servings) || 4,
      calories: calories ? parseInt(calories) : undefined,
      ingredients: validIngredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions: validInstructions.length > 0 ? validInstructions : ['Prepare and enjoy!'],
      tags: [],
    };

    const mealType = classifyRecipeByContent(tempRecipe as any);

    // Add meal type to tags if not already present
    const updatedTags = [...tagList];
    if (!updatedTags.includes(mealType)) {
      updatedTags.push(mealType);
    }

    let imageUrl = FALLBACK_IMAGE;
    try {
      const ingredientsForImage = validIngredients.map(ing => ({ name: ing.name, category: ing.category }));
      imageUrl = await generateRecipeImage(name.trim(), description.trim() || `A delicious ${name.trim()} recipe`, ingredientsForImage);
    } catch (error) {
      console.log('[AddRecipe] Failed to fetch Pexels image, using fallback:', error);
    }

    const recipe: Recipe = {
      id: '',
      name: name.trim(),
      description: description.trim() || `A delicious ${name.trim()} recipe`,
      imageUrl,
      prepTime: parseInt(prepTime) || 15,
      cookTime: parseInt(cookTime) || 30,
      servings: parseInt(servings) || 4,
      calories: calories ? parseInt(calories) : undefined,
      ingredients: validIngredients,
      instructions: validInstructions.length > 0 ? validInstructions : ['Prepare and enjoy!'],
      tags: updatedTags.length > 0 ? updatedTags : ['homemade', mealType],
      isAIGenerated: false,
      isImported: wasAutoFilled,
      isSaved: false,
      createdAt: new Date().toISOString(),
    };

    addRecipe(recipe);
    recipeGate.markUsed(); // recipe saved — spend the free use
    setIsSaving(false);
    router.dismissAll();
    router.replace('/(tabs)/recipes');
  }, [name, description, prepTime, cookTime, servings, calories, ingredients, instructions, tags, wasAutoFilled, addRecipe, router, recipeGate]);

  const isApiConfigured = isOpenAIConfigured();

  // ── Mic-icon pulse for the "Speak it" entry card ────────────────
  // Runs while the card is tappable (AI access + API configured), parks
  // at neutral otherwise. Uses RN's built-in Animated API with the
  // native driver — same proven pattern as PendingGenerationBanner
  // (sidesteps the Reanimated worklet quirk we hit there).
  const micPulse = useRef(new RNAnimated.Value(1)).current;
  const micPulseLoopRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  const micPulseActive = isApiConfigured;
  useEffect(() => {
    if (micPulseLoopRef.current) {
      micPulseLoopRef.current.stop();
      micPulseLoopRef.current = null;
    }
    if (micPulseActive) {
      micPulse.setValue(1);
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(micPulse, {
            toValue: 1.08,
            duration: 760,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
          RNAnimated.timing(micPulse, {
            toValue: 1,
            duration: 760,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      micPulseLoopRef.current = loop;
      loop.start();
    } else {
      RNAnimated.timing(micPulse, {
        toValue: 1,
        duration: 200,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }
    return () => {
      if (micPulseLoopRef.current) {
        micPulseLoopRef.current.stop();
        micPulseLoopRef.current = null;
      }
    };
  }, [micPulseActive, micPulse]);

  // ── Reusable styles ────────────────────────────────────────────────
  const fieldShellStyle = {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.bg,
  };
  const eyebrowStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.66,
    textTransform: 'uppercase' as const,
    color: designTokens.colors.ink3,
    marginBottom: 6,
  };
  const sectionTitleStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.36,
  };
  const fieldTextStyle = {
    fontFamily: designTokens.font.regular,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  };

  // Gated (free use spent) — paywall is showing, render nothing.
  if (recipeGate.blocked) return null;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Header ───────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 14,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.hair,
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={colors.ink} strokeWidth={1.7} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ChefHat size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                color: colors.ink,
                letterSpacing: -0.38,
              }}
            >
              Add{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 22,
                  letterSpacing: -0.22,
                }}
              >
                recipe
              </Text>
            </Text>
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!name.trim() || isSaving}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor:
                name.trim() && !isSaving
                  ? designTokens.colors.brand
                  : designTokens.colors.hair2,
            }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={designTokens.colors.cream} />
            ) : (
              <>
                <Check
                  size={14}
                  color={name.trim() ? designTokens.colors.cream : designTokens.colors.ink3}
                  strokeWidth={2}
                />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14,
                    color: name.trim() ? designTokens.colors.cream : designTokens.colors.ink3,
                    letterSpacing: -0.14,
                  }}
                >
                  Save
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Voice & Upload entry cards ───────────────── */}
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              {/*
                Symmetric flagship entry cards — equal 50/50 widths,
                each with the icon-disc + text stacked SIDE-BY-SIDE
                (mirrors the QuickActions secondary-tile pattern).
                Speak gets a pulsing olive disc to invite a tap; Snap
                gets a static sage disc. No pastel tints, no Sparkles.
              */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* ── Speak it (olive disc + pulsing mic) ── */}
                <Pressable
                  onPress={startRecording}
                  disabled={!isApiConfigured}
                  style={{ flex: 1 }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 11,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                        opacity: !isApiConfigured ? 0.55 : 1,
                        transform: [{ scale: pressed && micPulseActive ? 0.985 : 1 }],
                        ...elevation.card,
                      }}
                    >
                      <RNAnimated.View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 13,
                          backgroundColor: designTokens.colors.olive,
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: [{ scale: micPulse }],
                        }}
                      >
                        <Mic size={19} color="#F6F2E9" strokeWidth={1.9} />
                      </RNAnimated.View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 14.5,
                            color: colors.ink,
                            letterSpacing: -0.18,
                          }}
                          numberOfLines={1}
                        >
                          Speak it
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontFamily: designTokens.font.regular,
                            fontSize: 11.5,
                            lineHeight: 14,
                            color: designTokens.colors.ink2,
                          }}
                          numberOfLines={2}
                        >
                          Tell us what you cooked
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>

                {/* ── Snap or upload (sage disc + camera) ── */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowUploadModal(true);
                  }}
                  disabled={!isApiConfigured}
                  style={{ flex: 1 }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 11,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                        opacity: !isApiConfigured ? 0.55 : 1,
                        transform: [
                          { scale: pressed && isApiConfigured ? 0.985 : 1 },
                        ],
                        ...elevation.card,
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 13,
                          backgroundColor: designTokens.colors.brand,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Camera size={19} color="#F6F2E9" strokeWidth={1.9} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 14.5,
                            color: colors.ink,
                            letterSpacing: -0.18,
                          }}
                          numberOfLines={1}
                        >
                          Snap it
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontFamily: designTokens.font.regular,
                            fontSize: 11.5,
                            lineHeight: 14,
                            color: designTokens.colors.ink2,
                          }}
                          numberOfLines={2}
                        >
                          Photo or screenshot
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
              {isApiConfigured && (
                <Text
                  style={{
                    marginTop: 10,
                    textAlign: 'center',
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink3,
                  }}
                >
                  Speak, paste text, or upload an image — we'll fill in the details.
                </Text>
              )}
              {!isApiConfigured && (
                <Text
                  style={{
                    marginTop: 10,
                    textAlign: 'center',
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink3,
                  }}
                >
                  Supabase connection required for voice/upload features
                </Text>
              )}
            </Animated.View>

            {/* ── Divider ──────────────────────────────────────── */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: designTokens.colors.hair2 }} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.66,
                  textTransform: 'uppercase',
                  color: designTokens.colors.ink3,
                }}
              >
                or type manually
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: designTokens.colors.hair2 }} />
            </View>

            {/* ── Basic Info ───────────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <Text style={[sectionTitleStyle, { marginBottom: 12, paddingHorizontal: 4 }]}>
                Basic info
              </Text>

              {/* Recipe Name */}
              <View style={{ marginBottom: 12 }}>
                <Text style={eyebrowStyle}>Recipe name *</Text>
                <View style={fieldShellStyle}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Grandma's Apple Pie"
                    placeholderTextColor={designTokens.colors.ink3}
                    style={fieldTextStyle}
                  />
                </View>
              </View>

              {/* Description */}
              <View>
                <Text style={eyebrowStyle}>Description</Text>
                <View style={[fieldShellStyle, { minHeight: 96 }]}>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="A brief description of your recipe"
                    placeholderTextColor={designTokens.colors.ink3}
                    multiline
                    numberOfLines={3}
                    style={[fieldTextStyle, { minHeight: 72, textAlignVertical: 'top' }]}
                  />
                </View>
              </View>
            </Animated.View>

            {/* ── Recipe details ───────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <Text style={[sectionTitleStyle, { marginBottom: 12, paddingHorizontal: 4 }]}>
                Recipe details
              </Text>

              {/* 2x2 grid */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1, ...fieldShellStyle }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 6,
                    }}
                  >
                    <Clock size={12} color={designTokens.colors.brand} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 10.5,
                        letterSpacing: 0.42,
                        textTransform: 'uppercase',
                        color: designTokens.colors.ink3,
                      }}
                    >
                      Prep min
                    </Text>
                  </View>
                  <TextInput
                    value={prepTime}
                    onChangeText={setPrepTime}
                    keyboardType="numeric"
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 20,
                      color: colors.ink,
                      letterSpacing: -0.4,
                      padding: 0,
                    }}
                  />
                </View>
                <View style={{ flex: 1, ...fieldShellStyle }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 6,
                    }}
                  >
                    <Clock size={12} color={designTokens.colors.brand} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 10.5,
                        letterSpacing: 0.42,
                        textTransform: 'uppercase',
                        color: designTokens.colors.ink3,
                      }}
                    >
                      Cook min
                    </Text>
                  </View>
                  <TextInput
                    value={cookTime}
                    onChangeText={setCookTime}
                    keyboardType="numeric"
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 20,
                      color: colors.ink,
                      letterSpacing: -0.4,
                      padding: 0,
                    }}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, ...fieldShellStyle }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 6,
                    }}
                  >
                    <UsersRound size={12} color={designTokens.colors.brand} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 10.5,
                        letterSpacing: 0.42,
                        textTransform: 'uppercase',
                        color: designTokens.colors.ink3,
                      }}
                    >
                      Servings
                    </Text>
                  </View>
                  <TextInput
                    value={servings}
                    onChangeText={setServings}
                    keyboardType="numeric"
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 20,
                      color: colors.ink,
                      letterSpacing: -0.4,
                      padding: 0,
                    }}
                  />
                </View>
                <View style={{ flex: 1, ...fieldShellStyle }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 6,
                    }}
                  >
                    <Flame size={12} color={designTokens.colors.olive} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 10.5,
                        letterSpacing: 0.42,
                        textTransform: 'uppercase',
                        color: designTokens.colors.ink3,
                      }}
                    >
                      Calories
                    </Text>
                  </View>
                  <TextInput
                    value={calories}
                    onChangeText={setCalories}
                    placeholder="—"
                    placeholderTextColor={designTokens.colors.ink3}
                    keyboardType="numeric"
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 20,
                      color: colors.ink,
                      letterSpacing: -0.4,
                      padding: 0,
                    }}
                  />
                </View>
              </View>
            </Animated.View>

            {/* ── Ingredients ──────────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(225).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  paddingHorizontal: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Hash size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
                  <Text style={sectionTitleStyle}>Ingredients</Text>
                </View>
                <Pressable
                  onPress={addIngredient}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.brand,
                  }}
                >
                  <CirclePlus size={13} color="#fff" strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: '#fff',
                      letterSpacing: -0.0625,
                    }}
                  >
                    Add
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 10 }}>
                {ingredients.map((ing, index) => (
                  <View
                    key={ing.id}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.66,
                          textTransform: 'uppercase',
                          color: designTokens.colors.ink3,
                        }}
                      >
                        Ingredient {index + 1}
                      </Text>
                      {ingredients.length > 1 && (
                        <Pressable
                          onPress={() => removeIngredient(ing.id)}
                          hitSlop={8}
                          style={{ padding: 2 }}
                        >
                          <Trash2 size={15} color={designTokens.colors.ink3} strokeWidth={1.6} />
                        </Pressable>
                      )}
                    </View>
                    <View style={fieldShellStyle}>
                      <TextInput
                        value={ing.name}
                        onChangeText={(v) => updateIngredient(ing.id, 'name', v)}
                        placeholder="Ingredient name"
                        placeholderTextColor={designTokens.colors.ink3}
                        style={fieldTextStyle}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 2, ...fieldShellStyle }}>
                        <TextInput
                          value={ing.quantity}
                          onChangeText={(v) => updateIngredient(ing.id, 'quantity', v)}
                          placeholder="Qty"
                          placeholderTextColor={designTokens.colors.ink3}
                          style={fieldTextStyle}
                        />
                      </View>
                      <View style={{ flex: 3, ...fieldShellStyle }}>
                        <TextInput
                          value={ing.unit}
                          onChangeText={(v) => updateIngredient(ing.id, 'unit', v)}
                          placeholder="Unit (cup, tbsp, g)"
                          placeholderTextColor={designTokens.colors.ink3}
                          style={fieldTextStyle}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ── Instructions ─────────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(250).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  paddingHorizontal: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ScrollText size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
                  <Text style={sectionTitleStyle}>Instructions</Text>
                </View>
                <Pressable
                  onPress={addInstruction}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.brand,
                  }}
                >
                  <CirclePlus size={13} color="#fff" strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: '#fff',
                      letterSpacing: -0.0625,
                    }}
                  >
                    Add step
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 10 }}>
                {instructions.map((inst, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 14,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        backgroundColor: '#E8ECDF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13,
                          color: designTokens.colors.brand,
                        }}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <TextInput
                      value={inst}
                      onChangeText={(v) => updateInstruction(index, v)}
                      placeholder={`Step ${index + 1} — describe what to do`}
                      placeholderTextColor={designTokens.colors.ink3}
                      multiline
                      style={{
                        flex: 1,
                        minHeight: 24,
                        fontFamily: designTokens.font.regular,
                        fontSize: 15,
                        color: colors.ink,
                        lineHeight: 21,
                        padding: 0,
                        textAlignVertical: 'top',
                      }}
                    />
                    {instructions.length > 1 && (
                      <Pressable
                        onPress={() => removeInstruction(index)}
                        hitSlop={8}
                        style={{ padding: 2, marginTop: 4 }}
                      >
                        <Trash2 size={15} color={designTokens.colors.ink3} strokeWidth={1.6} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ── Tags ─────────────────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(275).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  paddingHorizontal: 4,
                }}
              >
                <Tag size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
                <Text style={sectionTitleStyle}>Tags</Text>
              </View>

              {/* Auto-classified meal type chip */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  alignSelf: 'flex-start',
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: '#E8ECDF',
                  marginBottom: 12,
                }}
              >
                <Tag size={11} color={designTokens.colors.brand} strokeWidth={2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: designTokens.colors.brand,
                  }}
                >
                  {classifiedMealType}
                </Text>
                <Check size={11} color={designTokens.colors.brand} strokeWidth={2.5} />
              </View>

              <View style={fieldShellStyle}>
                <TextInput
                  value={tags}
                  onChangeText={setTags}
                  placeholder="e.g., healthy, quick, vegetarian"
                  placeholderTextColor={designTokens.colors.ink3}
                  style={fieldTextStyle}
                />
              </View>
              <Text
                style={{
                  marginTop: 8,
                  paddingHorizontal: 4,
                  fontFamily: designTokens.font.regular,
                  fontSize: 12,
                  color: designTokens.colors.ink3,
                }}
              >
                Separate with commas. The meal-type tag above is auto-detected.
              </Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Voice Recording Modal ───────────────────────────── */}
      <Modal
        visible={showVoiceModal}
        transparent
        animationType="fade"
        onRequestClose={cancelRecording}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              borderRadius: 24,
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.hair,
              padding: 24,
              alignItems: 'center',
            }}
          >
            {isRecording ? (
              <>
                <View
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 999,
                    backgroundColor: 'rgba(228,109,70,0.10)',
                    borderWidth: 1.5,
                    borderColor: 'rgba(228,109,70,0.30)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 22,
                  }}
                >
                  <Animated.View
                    style={[
                      pulseAnimatedStyle,
                      {
                        width: 72,
                        height: 72,
                        borderRadius: 999,
                        backgroundColor: designTokens.colors.charcoal,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <MicVocal size={28} color={designTokens.colors.cream} strokeWidth={1.8} />
                  </Animated.View>
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 22,
                    color: colors.ink,
                    letterSpacing: -0.44,
                    marginBottom: 6,
                  }}
                >
                  Listening…
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 14,
                    color: designTokens.colors.ink2,
                    textAlign: 'center',
                    marginBottom: 20,
                    lineHeight: 20,
                  }}
                >
                  Speak naturally — name, ingredients, steps.
                </Text>
                <Pressable
                  onPress={stopRecording}
                  style={{
                    width: '100%',
                    paddingVertical: 13,
                    borderRadius: 14,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 14.5,
                      color: '#fff',
                      letterSpacing: -0.145,
                    }}
                  >
                    Done speaking
                  </Text>
                </Pressable>
                <Pressable
                  onPress={cancelRecording}
                  style={{
                    width: '100%',
                    paddingVertical: 13,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 14.5,
                      color: colors.ink,
                      letterSpacing: -0.145,
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : isProcessing ? (
              <>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    backgroundColor: '#E8ECDF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                    position: 'relative',
                  }}
                >
                  <Sparkles size={22} color={designTokens.colors.olive} strokeWidth={1.8} />
                  <View style={{ position: 'absolute', bottom: -4, right: -4 }}>
                    <ActivityIndicator size="small" color={designTokens.colors.brand} />
                  </View>
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 18,
                    color: colors.ink,
                    letterSpacing: -0.18,
                    marginBottom: 4,
                  }}
                >
                  Processing…
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13.5,
                    color: designTokens.colors.ink2,
                    textAlign: 'center',
                  }}
                >
                  Turning your voice into a recipe
                </Text>
                {transcribedText && (
                  <View
                    style={{
                      marginTop: 16,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: designTokens.colors.hair2,
                      width: '100%',
                      maxHeight: 120,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 10.5,
                        letterSpacing: 0.55,
                        textTransform: 'uppercase',
                        color: designTokens.colors.ink3,
                        marginBottom: 4,
                      }}
                    >
                      Transcribed
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink2,
                        lineHeight: 18,
                      }}
                      numberOfLines={3}
                    >
                      {transcribedText}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={cancelRecording}
                  style={{
                    marginTop: 16,
                    paddingVertical: 11,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 14,
                      color: designTokens.colors.ink2,
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : voiceError ? (
              <>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    backgroundColor: 'rgba(228,109,70,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                  }}
                >
                  <MicOff size={26} color={designTokens.colors.olive} strokeWidth={1.8} />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 18,
                    color: colors.ink,
                    letterSpacing: -0.18,
                    marginBottom: 6,
                  }}
                >
                  Couldn't hear that
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13.5,
                    color: designTokens.colors.ink2,
                    textAlign: 'center',
                    lineHeight: 19,
                    marginBottom: 18,
                  }}
                >
                  {voiceError}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <Pressable
                    onPress={cancelRecording}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14,
                        color: colors.ink,
                        letterSpacing: -0.14,
                      }}
                    >
                      Type instead
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setVoiceError(null);
                      startRecording();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 14,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: '#fff',
                        letterSpacing: -0.14,
                      }}
                    >
                      Try again
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Upload Recipe Modal ─────────────────────────────── */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="slide"
        onRequestClose={cancelUpload}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                cancelUpload();
              }}
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.45)',
                justifyContent: 'flex-end',
              }}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                  backgroundColor: colors.bg,
                  maxHeight: '88%',
                  paddingTop: 10,
                  paddingHorizontal: 20,
                  paddingBottom: 28,
                }}
              >
                {/* Drag handle */}
                <View style={{ alignItems: 'center', paddingBottom: 10 }}>
                  <View
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.hair,
                    }}
                  />
                </View>

                {isUploadProcessing ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <View
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 999,
                        backgroundColor: '#E8ECDF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 18,
                        position: 'relative',
                      }}
                    >
                      <Sparkles
                        size={22}
                        color={designTokens.colors.olive}
                        strokeWidth={1.8}
                      />
                      <View style={{ position: 'absolute', bottom: -4, right: -4 }}>
                        <ActivityIndicator
                          size="small"
                          color={designTokens.colors.brand}
                        />
                      </View>
                    </View>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 18,
                        color: colors.ink,
                        letterSpacing: -0.18,
                        marginBottom: 4,
                      }}
                    >
                      Reading your recipe…
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink3,
                        textAlign: 'center',
                      }}
                    >
                      This usually takes a few seconds
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                  >
                    {/* Header */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 18,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 19,
                          color: colors.ink,
                          letterSpacing: -0.38,
                        }}
                      >
                        Upload recipe
                      </Text>
                      <Pressable
                        onPress={cancelUpload}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.hair,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
                      </Pressable>
                    </View>

                    {/* Error banner */}
                    {uploadError && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.hair,
                          backgroundColor: designTokens.colors.cream,
                          marginBottom: 16,
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            backgroundColor: 'rgba(228,109,70,0.12)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <MicOff
                            size={14}
                            color={designTokens.colors.olive}
                            strokeWidth={1.8}
                          />
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontFamily: designTokens.font.regular,
                            fontSize: 13,
                            color: colors.ink,
                            lineHeight: 18,
                          }}
                        >
                          {uploadError}
                        </Text>
                      </View>
                    )}

                    {/* Section eyebrow + count */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <Text style={eyebrowStyle}>Add images</Text>
                      {uploadedImages.length > 0 && (
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 11.5,
                            color: designTokens.colors.brand,
                            letterSpacing: -0.05,
                          }}
                        >
                          {uploadedImages.length}/5
                        </Text>
                      )}
                    </View>

                    {/* Image gallery */}
                    {uploadedImages.length > 0 && (
                      <View style={{ marginBottom: 14 }}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ flexGrow: 0 }}
                          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                        >
                          {uploadedImages.map((uri, index) => (
                            <View key={uri} style={{ position: 'relative' }}>
                              <Image
                                source={{ uri }}
                                style={{
                                  width: 88,
                                  height: 88,
                                  borderRadius: 12,
                                  backgroundColor: '#F4F0E8',
                                }}
                              />
                              <Pressable
                                onPress={() => handleRemoveImage(index)}
                                hitSlop={6}
                                style={{
                                  position: 'absolute',
                                  top: -6,
                                  right: -6,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  backgroundColor: designTokens.colors.olive,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: 2,
                                  borderColor: colors.bg,
                                }}
                              >
                                <X size={11} color="#fff" strokeWidth={2.4} />
                              </Pressable>
                            </View>
                          ))}
                          {uploadedImages.length < 5 && (
                            <Pressable
                              onPress={handleImageUpload}
                              style={{
                                width: 88,
                                height: 88,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderStyle: 'dashed',
                                borderColor: colors.hair,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.bg,
                              }}
                            >
                              <CirclePlus
                                size={20}
                                color={designTokens.colors.brand}
                                strokeWidth={1.7}
                              />
                            </Pressable>
                          )}
                        </ScrollView>

                        {/* Process images button */}
                        <Pressable
                          onPress={handleProcessImages}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            paddingVertical: 13,
                            borderRadius: 14,
                            backgroundColor: designTokens.colors.brand,
                            marginTop: 12,
                          }}
                        >
                          <Sparkles size={16} color="#fff" strokeWidth={1.8} />
                          <Text
                            style={{
                              fontFamily: designTokens.font.semibold,
                              fontSize: 14.5,
                              color: '#fff',
                              letterSpacing: -0.145,
                            }}
                          >
                            Extract recipe from {uploadedImages.length} image
                            {uploadedImages.length !== 1 ? 's' : ''}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Camera / Photos initial picker (no images yet) */}
                    {uploadedImages.length === 0 && (
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                        <Pressable
                          onPress={handleCameraCapture}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            paddingVertical: 14,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: colors.hair,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <Camera
                            size={16}
                            color={designTokens.colors.brand}
                            strokeWidth={1.7}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 13.5,
                              color: colors.ink,
                              letterSpacing: -0.135,
                            }}
                          >
                            Take photo
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={handleImageUpload}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            paddingVertical: 14,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: colors.hair,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <FileUp
                            size={16}
                            color={designTokens.colors.brand}
                            strokeWidth={1.7}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 13.5,
                              color: colors.ink,
                              letterSpacing: -0.135,
                            }}
                          >
                            Choose photos
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* "Add more" row (1–4 images) */}
                    {uploadedImages.length > 0 && uploadedImages.length < 5 && (
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                        <Pressable
                          onPress={handleCameraCapture}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 11,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.hair,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <Camera
                            size={13}
                            color={designTokens.colors.brand}
                            strokeWidth={1.7}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12.5,
                              color: colors.ink,
                            }}
                          >
                            Add camera
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={handleImageUpload}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 11,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.hair,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <FileUp
                            size={13}
                            color={designTokens.colors.brand}
                            strokeWidth={1.7}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12.5,
                              color: colors.ink,
                            }}
                          >
                            Add photos
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Divider */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: designTokens.colors.hair2,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.66,
                          textTransform: 'uppercase',
                          color: designTokens.colors.ink3,
                        }}
                      >
                        or paste text
                      </Text>
                      <View
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: designTokens.colors.hair2,
                        }}
                      />
                    </View>

                    {/* Text input */}
                    <View style={[fieldShellStyle, { minHeight: 140, marginBottom: 14 }]}>
                      <TextInput
                        value={uploadText}
                        onChangeText={(text) => setUploadText(text.slice(0, 2000))}
                        placeholder="Paste your recipe here — ingredients, steps, anything we can read."
                        placeholderTextColor={designTokens.colors.ink3}
                        multiline
                        numberOfLines={5}
                        maxLength={2000}
                        style={[fieldTextStyle, { minHeight: 120, textAlignVertical: 'top' }]}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 11,
                          color: designTokens.colors.ink3,
                          textAlign: 'right',
                          marginTop: 6,
                        }}
                      >
                        {uploadText.length}/2000
                      </Text>
                    </View>

                    {/* Process text button */}
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        handleProcessText();
                      }}
                      disabled={!uploadText.trim()}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 13,
                        borderRadius: 14,
                        backgroundColor: uploadText.trim()
                          ? designTokens.colors.brand
                          : designTokens.colors.hair2,
                        marginBottom: 8,
                      }}
                    >
                      <FileText
                        size={16}
                        color={uploadText.trim() ? '#fff' : designTokens.colors.ink3}
                        strokeWidth={1.8}
                      />
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 14.5,
                          color: uploadText.trim() ? '#fff' : designTokens.colors.ink3,
                          letterSpacing: -0.145,
                        }}
                      >
                        Extract recipe from text
                      </Text>
                    </Pressable>
                  </ScrollView>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
