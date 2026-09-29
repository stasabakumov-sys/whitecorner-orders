export function packingStateLabel(state?:string):string {
 switch(state){
  case 'assigned':return 'Sent to cutting';
  case 'transfer_requested':return 'Loading to laser';
  case 'transferred':return 'Ready to cut';
  case 'completed':return 'Boxes made';
  case 'cancelled':return 'Cancelled';
  default:return state||'Not sent';
 }
}
