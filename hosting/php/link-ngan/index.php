<?php
// Đặt file này vào public_html của TÊN MIỀN PHỤ (không phải website Family).
// Sửa dòng dưới thành tên miền website Family của bạn, giữ https:// và không có dấu / ở cuối.
$website = 'https://TEN-MIEN-WEBSITE-FAMILY';

// tên-miền-phụ/?K7P2QX → website/?K7P2QX (mở trang tra cứu, mã điền sẵn); còn lại → trang tra cứu.
$code = (string)($_SERVER['QUERY_STRING'] ?? '');
header('Cache-Control: no-store');
header('Location: ' . $website . (preg_match('/^[A-Za-z0-9]{6}$/D', $code) ? '/?' . $code : '/tra-cuu.html'), true, 302);
