-- ===========================================
-- Rib-Generator Initial Schema
-- Created: 2026-03-30
-- ===========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- TABLES
-- ===========================================

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    avatar_url TEXT,
    pottery_type TEXT DEFAULT 'all',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_id UNIQUE (user_id)
);

-- Drafts table (user's saved designs)
CREATE TABLE public.drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Untitled Draft',
    thumbnail_url TEXT,
    stl_data TEXT,
    metadata JSONB DEFAULT '{}',
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table (Stripe transactions)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    plan TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER,
    currency TEXT DEFAULT 'EUR',
    stripe_payment_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking table
CREATE TABLE public.usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_action_period UNIQUE (user_id, action_type, period_month, period_year)
);

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);

CREATE INDEX idx_drafts_user_id ON public.drafts(user_id);
CREATE INDEX idx_drafts_created_at ON public.drafts(created_at);
CREATE INDEX idx_drafts_updated_at ON public.drafts(updated_at);

CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_created_at ON public.payments(created_at);

CREATE INDEX idx_usage_user_id ON public.usage(user_id);
CREATE INDEX idx_usage_period ON public.usage(period_month, period_year);

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

-- Profiles: User can only read/write their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Drafts: User can only read/write/delete their own drafts
CREATE POLICY "Users can view own drafts"
    ON public.drafts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own drafts"
    ON public.drafts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
    ON public.drafts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
    ON public.drafts FOR DELETE
    USING (auth.uid() = user_id);

-- Payments: User can only read their own payments
CREATE POLICY "Users can view own payments"
    ON public.payments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payments"
    ON public.payments FOR ALL
    USING (auth.role() = 'service_role');

-- Usage: User can only read their own usage
CREATE POLICY "Users can view own usage"
    ON public.usage FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
    ON public.usage FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
    ON public.usage FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- FUNCTIONS & TRIGGERS
-- ===========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER drafts_updated_at
    BEFORE UPDATE ON public.drafts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER usage_updated_at
    BEFORE UPDATE ON public.usage
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ===========================================
-- STORAGE BUCKET
-- ===========================================

-- Create thumbnails bucket (public read, authenticated write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'thumbnails',
    'thumbnails',
    true,
    5242880, -- 5MB
    ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for thumbnails bucket
CREATE POLICY "Anyone can view thumbnails"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload own thumbnails"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'thumbnails' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own thumbnails"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'thumbnails' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- ===========================================
-- INITIAL DATA
-- ===========================================

-- Default credit tiers (can be extended later)
-- INSERT INTO public.plans (name, credits, price_cents) VALUES
--     ('Free', 3, 0),
--     ('Studio', 30, 990),
--     ('Workshop', 500, 2900);
