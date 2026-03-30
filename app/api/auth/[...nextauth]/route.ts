import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createClient } from '@supabase/supabase-js';
import type { Adapter } from 'next-auth/adapters';
import { supabaseAdmin } from '@/lib/supabase-admin';

// NextAuth Adapter for Supabase
function createSupabaseAdapter() {
  return {
    async createUser(user) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email!,
        email_confirm: true,
        user_metadata: {
          full_name: user.name,
          avatar_url: user.image,
        },
      });

      if (error || !data.user) {
        throw new Error(error?.message || 'Failed to create user');
      }

      return {
        id: data.user.id,
        name: user.name,
        email: user.email!,
        emailVerified: null,
        image: user.image,
      };
    },

    async getUser(id) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      
      if (error || !data.user) return null;
      
      return {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || null,
        email: data.user.email!,
        emailVerified: data.user.email_confirmed_at ? new Date(data.user.email_confirmed_at) : null,
        image: data.user.user_metadata?.avatar_url || null,
      };
    },

    async getUserByEmail(email) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();
      const user = data?.users.find(u => u.email === email);
      
      if (!user) return null;
      
      return {
        id: user.id,
        name: user.user_metadata?.full_name || null,
        email: user.email!,
        emailVerified: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
        image: user.user_metadata?.avatar_url || null,
      };
    },

    async getUserByAccount({ provider, providerAccountId }) {
      // For OAuth accounts, check in user metadata
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('avatar_url', `oauth:${provider}:${providerAccountId}`)
        .single();
      
      if (data) {
        return this.getUser(data.user_id);
      }
      
      return null;
    },

    async updateUser(user) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        user.id!,
        {
          user_metadata: {
            full_name: user.name,
            avatar_url: user.image,
          },
        }
      );

      if (error || !data.user) {
        throw new Error(error?.message || 'Failed to update user');
      }

      return {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || null,
        email: data.user.email!,
        emailVerified: data.user.email_confirmed_at ? new Date(data.user.email_confirmed_at) : null,
        image: data.user.user_metadata?.avatar_url || null,
      };
    },

    async deleteUser(userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    },

    async linkAccount(account) {
      // Store OAuth link in user metadata
      await supabaseAdmin.auth.admin.updateUserById(account.userId, {
        user_metadata: {
          oauth_provider: account.provider,
          oauth_id: account.providerAccountId,
        },
      });
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await supabaseAdmin.auth.admin.updateUserById(
        (await supabaseAdmin.auth.getUser()).id,
        { user_metadata: {} }
      );
    },

    async createSession({ sessionToken, userId, expires }) {
      // Supabase handles sessions differently - this is a no-op
      return { sessionToken, userId, expires };
    },

    async getSessionAndUser(sessionToken) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser();
      
      if (error || !user) return null;
      
      return {
        session: {
          sessionToken,
          userId: user.id,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        user: {
          id: user.id,
          name: user.user_metadata?.full_name || null,
          email: user.email!,
          emailVerified: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
          image: user.user_metadata?.avatar_url || null,
        },
      };
    },

    async updateSession({ sessionToken, expires }) {
      return { sessionToken, expires };
    },

    async deleteSession(sessionToken) {
      return null;
    },
  } as Adapter;
}

export const authOptions: NextAuthOptions = {
  adapter: createSupabaseAdapter(),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/login',
    newUser: '/auth/onboarding',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
