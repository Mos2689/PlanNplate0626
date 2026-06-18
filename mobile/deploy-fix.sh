#!/bin/bash
# Quick deployment script for Edge Function fix

echo "=========================================="
echo "Edge Function JWT Fix - Deployment Script"
echo "=========================================="
echo ""
echo "IMPORTANT: This script deploys Edge Functions with config.toml"
echo "which disables gateway-level JWT verification."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    echo "   or"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

echo "Supabase CLI found"
echo ""

# Check if config.toml exists
if [ ! -f "supabase/config.toml" ]; then
    echo "WARNING: supabase/config.toml not found!"
    echo "Creating it now..."
    mkdir -p supabase
    cat > supabase/config.toml << 'EOF'
[functions.openai-chat]
verify_jwt = false

[functions.openai-transcribe]
verify_jwt = false
EOF
    echo "Created supabase/config.toml"
fi

echo ""
echo "Step 1: Checking config.toml..."
cat supabase/config.toml
echo ""

# Get project ref
read -p "Enter your Supabase project ref (from dashboard URL): " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "Project ref is required"
    exit 1
fi

echo ""
echo "Step 2: Linking to project..."
supabase link --project-ref "$PROJECT_REF"

if [ $? -ne 0 ]; then
    echo "Failed to link project. Make sure you're logged in:"
    echo "   supabase login"
    exit 1
fi

echo ""
echo "Step 3: Checking secrets..."
echo "You should see OPENAI_API_KEY and PROJECT_ANON_KEY:"
supabase secrets list

echo ""
read -p "Are PROJECT_ANON_KEY and OPENAI_API_KEY both set? (y/n): " SECRETS_OK

if [ "$SECRETS_OK" != "y" ]; then
    echo ""
    echo "Please set the missing secrets:"
    echo "  supabase secrets set PROJECT_ANON_KEY=your-anon-key"
    echo "  supabase secrets set OPENAI_API_KEY=your-openai-key"
    exit 1
fi

echo ""
echo "Step 4: Deploying Edge Functions with config.toml..."
echo "This will disable gateway-level JWT verification."
supabase functions deploy openai-chat
supabase functions deploy openai-transcribe

if [ $? -ne 0 ]; then
    echo "Failed to deploy Edge Functions"
    exit 1
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "The config.toml disables Supabase's built-in JWT verification."
echo "Your Edge Functions now handle authentication themselves."
echo ""
echo "Next steps:"
echo "1. Clear your app cache and restart"
echo "2. Try generating a recipe"
echo "3. Check logs for success indicators:"
echo "   - [Auth] JWT verification successful"
echo "   - Recipe generated successfully!"
echo ""
