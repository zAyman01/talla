INSERT INTO tenants (id,subdomain,name_ar,name_en)
VALUES ('11111111-1111-4111-8111-111111111111','demo','طلّة','Talla')
ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en;

INSERT INTO garments
  (tenant_id,id,name_ar,name_en,price,status,spec,published_assets)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'تي شيرت بطبعة قطنية',
    'Printed cotton tee',
    65000,
    'ready',
    '{"block_id":"tee-crew-relaxed","style":{"slot":"top","dominant_colors":["#17181a"]}}',
    '{"catalog_image":{"url":"/references/tee-front.webp","width":1795,"height":2048},"color_hex":"#17181a","color_label":"أسود"}'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    'جينز أزرق مستقيم',
    'Straight blue jeans',
    110000,
    'ready',
    '{"block_id":"jeans-straight","style":{"slot":"bottom","dominant_colors":["#2a4b7c"]}}',
    '{"catalog_image":{"url":"/references/jeans.webp","width":435,"height":650},"color_hex":"#2a4b7c","color_label":"أزرق"}'
  )
ON CONFLICT (tenant_id,id) DO NOTHING;

INSERT INTO stock (tenant_id,garment_id,size,quantity)
VALUES
  ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','S',8),
  ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','M',8),
  ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','L',8),
  ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','XL',8),
  ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','S',6),
  ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','M',6),
  ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','L',6)
ON CONFLICT (tenant_id,garment_id,size) DO NOTHING;
