-- Pin search paths on pure/trigger helpers. These functions do not need to
-- resolve application objects, so an empty path removes search-path hijacking
-- risk while pg_catalog built-ins remain available implicitly.

alter function public.engagement_touch_updated_at()
  set search_path = '';

alter function public.engagement_cuisine_vocab()
  set search_path = '';

alter function public.engagement_is_edible_slot(text)
  set search_path = '';
