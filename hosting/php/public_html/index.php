<?php
require dirname(__DIR__).'/family-private/runtime.php';
familyRuntimeEnter();
require dirname(__DIR__).'/family-private/core.php';
try {
    $c=config();checkRequest($c);
    if (!authorized($c)) {header('Location: /access',true,302);exit;}
    header('Cache-Control: no-store');header('Content-Type: text/html; charset=utf-8');readfile(__DIR__.'/index.html');
} catch (Throwable $e) {
    http_response_code($e instanceof FamilyError?$e->status:503);header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cài đặt Family</title><body><h1>Cài đặt Family</h1><p>'.htmlspecialchars($e instanceof FamilyError?$e->getMessage():'Kiểm tra file cấu hình Family.',ENT_QUOTES,'UTF-8').'</p><p>Xem hướng dẫn cài đặt trong gói tải xuống.</p></body></html>';
}
