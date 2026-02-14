export interface UserPreferences {
  id: string;
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  top_size: string | null;
  bottom_size: string | null;
  shoe_size: string | null;
  fit_preference: "slim" | "regular" | "relaxed" | "oversized" | null;
  preferred_styles: string[];
  preferred_colors: string[];
  preferred_brands: string[];
  budget_min: number | null;
  budget_max: number | null;
  gender: "male" | "female" | "non-binary" | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}
