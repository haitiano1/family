<?php
declare(strict_types=1);
// Bootstrap component: release packages do not replace this request gate.
function familyRuntimeEnter(): void {
    $dir=__DIR__.'/.updates';
    if(!is_dir($dir)&&!@mkdir($dir,0700,true))return;
    $lock=@fopen($dir.'/runtime.lock','c+');
    if(!$lock)return;
    if(!flock($lock,LOCK_SH|LOCK_NB)||is_file($dir.'/maintenance.json')){
        fclose($lock);http_response_code(503);header('Retry-After: 5');header('Cache-Control: no-store');header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error'=>'Website đang cập nhật. Chờ hoàn tất rồi tải lại trang.'],JSON_UNESCAPED_UNICODE);exit;
    }
    $GLOBALS['family_runtime_lock']=$lock;
}
